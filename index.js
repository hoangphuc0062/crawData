import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

// Lọc chỉ giữ ký tự số, trả về số. Ví dụ: "6.000.000đ" -> 6000000
const extractNumber = (input) => {
    const digits = String(input || '').replace(/[^0-9]/g, '');
    return digits ? Number(digits) : 0;
};

// Danh sách các thương hiệu cần crawl
const TARGET_BRANDS = [
    'Lava',
    'Enya',
    'Soloking',
    'Natasha',
    'Sqoe',
    'Donner',
    'Hotone',
    'Nux',
    'Valeton',
    'Sonicake',
    'Mwave',
    'Cuvave',
    'Aroma',
    'Fuzz',
    'Coolmusic',
    'Avatar',
    'Yuer',
    'Wireless NUX',
    'Rex',
    'Peavey',
    'M-Vave',
    'HXM',
    'Martinez', // Sửa lỗi chính tả từ "Matinez"
    'Fesley',   // Sửa lỗi chính tả từ "Feslay"
    'Gomera',
    'Farida',
    'DK',       // Sửa từ "Dk" thành "DK"
    'Eforce',
    'Cordoba',
    'Auriga'    // Rút gọn từ "Auriga Guitar"
];

// Hàm kiểm tra xem brand có trong danh sách target không
const isTargetBrand = (brandName) => {
    const normalizedBrandName = brandName.toLowerCase().trim();
    return TARGET_BRANDS.some(target => {
        const normalizedTarget = target.toLowerCase().trim();
        // Kiểm tra chính xác hoặc chứa từ khóa
        return normalizedBrandName === normalizedTarget || 
               normalizedBrandName.includes(normalizedTarget) ||
               normalizedTarget.includes(normalizedBrandName);
    });
};

// Hàm crawl sản phẩm từ một brand
async function crawlBrandProducts(page, brandUrl, brandName) {
    console.log(`\n🏷️  === BẮT ĐẦU CRAWL BRAND: ${brandName} ===`);
    console.log(`🔗 URL: ${brandUrl}`);
    
    await page.goto(brandUrl);
    await page.waitForSelector('.prd-grid .col .prd-name a', { timeout: 10000 }).catch(() => {
        console.log(`⚠️  Không tìm thấy sản phẩm cho brand: ${brandName}`);
        return [];
    });

    // Thu thập tất cả URL sản phẩm từ tất cả các trang của brand này
    let allProductUrls = [];
    
    // Kiểm tra có phân trang không
    const hasPagination = await page.evaluate(() => {
        const paginationElement = document.querySelector('[role="navigation"][aria-label="Phân trang"]');
        return !!paginationElement;
    });

    if (hasPagination) {
        console.log(`🔍 Brand ${brandName} có phân trang, đang thu thập tất cả các trang...`);
        
        // Lấy tổng số trang
        const totalPages = await page.evaluate(() => {
            const pageLinks = document.querySelectorAll('.pagination .pagination__item:not(.pagination__item--current)');
            let maxPage = 1;
            
            pageLinks.forEach(link => {
                const pageText = link.textContent?.trim();
                if (pageText && !isNaN(pageText)) {
                    const pageNum = parseInt(pageText, 10);
                    if (pageNum > maxPage) {
                        maxPage = pageNum;
                    }
                }
            });
            
            return maxPage;
        });

        console.log(`📄 Brand ${brandName} có ${totalPages} trang`);

        // Lấy sản phẩm từ từng trang
        for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
            console.log(`🔄 Đang xử lý trang ${currentPage}/${totalPages} của ${brandName}...`);
            
            // Điều hướng đến trang cụ thể (trừ trang 1 vì đã ở đó)
            if (currentPage > 1) {
                const pageUrl = brandUrl + (brandUrl.includes('?') ? '&' : '?') + `page=${currentPage}`;
                await page.goto(pageUrl);
                await page.waitForSelector('.prd-grid .col .prd-name a', { timeout: 10000 });
            }

            // Lấy URL sản phẩm từ trang hiện tại
            const pageProductUrls = await page.evaluate(() => {
                const products = document.querySelectorAll('.prd-grid .col .prd-name a');
                return Array.from(products).map(a => a.getAttribute('href'));
            });

            console.log(`   ✅ Trang ${currentPage}: ${pageProductUrls.length} sản phẩm`);
            allProductUrls.push(...pageProductUrls);
        }
    } else {
        console.log(`📄 Brand ${brandName} không có phân trang, chỉ có 1 trang`);
        
        // Lấy sản phẩm từ trang duy nhất
        const pageProductUrls = await page.evaluate(() => {
            const products = document.querySelectorAll('.prd-grid .col .prd-name a');
            return Array.from(products).map(a => a.getAttribute('href'));
        });
        
        allProductUrls = pageProductUrls;
    }

    // Loại bỏ URL trùng lặp (nếu có)
    allProductUrls = [...new Set(allProductUrls)];
    
    console.log(`🎯 Brand ${brandName}: ${allProductUrls.length} sản phẩm duy nhất`);

    // Crawl chi tiết từng sản phẩm
    const brandProducts = [];

    for (let i = 0; i < allProductUrls.length; i++) {
        const productUrl = allProductUrls[i];
        console.log(`📦 [${i + 1}/${allProductUrls.length}] ${brandName} - Đang xử lý: ${productUrl}`);
        
        await page.goto("https://mainguyenmusic.vn" + productUrl);

        const productDetail = await page.evaluate(() => {
            const productName = document.querySelector('h1.prd-block-name')?.textContent?.trim() || '';
            const priceRegular = document.querySelector('.prd-price-regular')?.textContent?.trim() || '';
            const priceOld = document.querySelector('.prd-price-old')?.textContent?.trim() || '';
            const productType = document.querySelector('p[data-render*="meta-extended"] a[href*="collections/types"]')?.textContent?.trim() || '';
            const brand = document.querySelector('p[data-render*="meta-extended"] a[href*="collections/vendors"]')?.textContent?.trim() || '';

            let description = document.querySelector('.tab-accordion-item-content.js-set-height .rte')?.innerHTML?.trim() || '';

            if (description) {
                description = description.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
                description = description.replace(/style="[^"]*"/gi, '');
                description = description.replace(/<div[^>]*>\s*<\/div>/gi, '');
                description = description.replace(/\s+/g, ' ').trim();
            }

            // Lấy tổng số ảnh từ aria-label của slide cuối cùng
            const allSlides = document.querySelectorAll('.prd-block-gallery-thumbs .swiper-slide[aria-label]');
            let totalImages = 0;

            if (allSlides.length > 0) {
                const lastSlide = allSlides[allSlides.length - 1];
                const ariaLabel = lastSlide.getAttribute('aria-label') || '';
                const match = ariaLabel.match(/(\d+)\s*\/\s*(\d+)/);
                if (match) {
                    totalImages = parseInt(match[2], 10) || 0;
                }
            }

            // Hàm chọn URL lớn nhất từ srcset
            const pickLargestFromSrcset = (srcset) => {
                try {
                    const items = (srcset || '')
                        .split(',')
                        .map(s => s.trim())
                        .map(s => {
                            const [url, size] = s.split(/\s+/);
                            const width = parseInt((size || '').replace(/[^0-9]/g, ''), 10) || 0;
                            return { url, width };
                        })
                        .filter(x => x.url);
                    if (!items.length) return '';
                    items.sort((a, b) => b.width - a.width);
                    return items[0].url;
                } catch (_) {
                    return '';
                }
            };

            // Chuẩn hóa URL ảnh
            const normalizeUrl = (u) => {
                if (!u) return '';
                if (u.startsWith('http://') || u.startsWith('https://')) return u;
                if (u.startsWith('//')) return 'https:' + u;
                if (u.startsWith('/')) return 'https://mainguyenmusic.vn' + u;
                return u;
            };

            // Lấy ảnh với nhiều fallback
            let imageUrls = [];

            // 1. Thử lấy từ thumbnail gallery
            const thumbImgs = Array.from(document.querySelectorAll('.prd-block-gallery-thumbs .swiper-slide img'));
            imageUrls = thumbImgs.map(img => {
                const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
                const fromSet = pickLargestFromSrcset(srcset);
                const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                const chosen = fromSet || src;
                return normalizeUrl(chosen);
            }).filter(Boolean);

            // 2. Fallback: main carousel
            if (imageUrls.length === 0) {
                const mainImgs = Array.from(document.querySelectorAll('#prdMainImage img, .prd-block-gallery-main img'));
                imageUrls = mainImgs.map(img => {
                    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
                    const fromSet = pickLargestFromSrcset(srcset);
                    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                    const chosen = fromSet || src;
                    return normalizeUrl(chosen);
                }).filter(Boolean);
            }

            // 3. Fallback: image-container với class cụ thể
            if (imageUrls.length === 0) {
                const containerImgs = Array.from(document.querySelectorAll('.image-container.ic--bg-white.ic--hor.ic--image-loaded img'));
                imageUrls = containerImgs.map(img => {
                    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
                    const fromSet = pickLargestFromSrcset(srcset);
                    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                    const chosen = fromSet || src;
                    return normalizeUrl(chosen);
                }).filter(Boolean);
            }

            // 4. Fallback cuối: bất kỳ image-container nào
            if (imageUrls.length === 0) {
                const anyImgs = Array.from(document.querySelectorAll('.image-container img'));
                imageUrls = anyImgs.map(img => {
                    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
                    const fromSet = pickLargestFromSrcset(srcset);
                    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                    const chosen = fromSet || src;
                    return normalizeUrl(chosen);
                }).filter(Boolean);
            }

            // Lấy màu sắc
            const colorVariants = [];
            const colorOptions = document.querySelectorAll('.prd-option-list.has-option-color label[data-tippy-content]');
            if (colorOptions.length > 0) {
                colorOptions.forEach(label => {
                    const color = label.getAttribute('data-tippy-content')?.trim();
                    if (color) {
                        colorVariants.push(color);
                    }
                });
            }

            const productUrl = window.location.href;
            return {
                name: productName,
                priceRegular: priceRegular,
                priceOld: priceOld,
                productType: productType,
                brand: brand,
                description: description,
                totalImages: totalImages,
                images: imageUrls,
                colorVariants: colorVariants,
                productUrl: productUrl
            };
        });

        // Kiểm tra trùng lặp trước khi thêm vào danh sách
        const isDuplicate = brandProducts.some(existing => existing.name === productDetail.name);
        if (!isDuplicate && productDetail.name) {
            brandProducts.push(productDetail);
        } else if (isDuplicate) {
            console.log(`⚠️  Bỏ qua sản phẩm trùng lặp: ${productDetail.name}`);
            continue;
        }

        console.log(`✅ ${productDetail.name} - ${productDetail.priceRegular}`);

        // Tải ảnh (tùy chọn - có thể bỏ comment nếu muốn)
        const slugify = (s) => {
            return (s || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/đ/g, 'd')
                .replace(/Đ/g, 'D')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 150);
        };

        const countToDownload = Math.min(productDetail.totalImages || 0, (productDetail.images || []).length);
        if (countToDownload > 0) {
            const brandSlug = slugify(productDetail.brand || 'thuong-hieu');
            const productSlug = slugify(productDetail.name || 'san-pham');
            const folder = path.join(process.cwd(), 'imgs', brandSlug, productSlug);
            if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
            for (let i = 0; i < countToDownload; i++) {
                const url = productDetail.images[i];
                try {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const ab = await res.arrayBuffer();
                    const u = new URL(url);
                    const ext = path.extname(u.pathname) || '.jpg';
                    const filePath = path.join(folder, `${productSlug}-${i + 1}${ext}`);
                    fs.writeFileSync(filePath, Buffer.from(ab));
                    console.log(`⬇️  Ảnh ${i + 1}/${countToDownload} -> ${filePath}`);
                } catch (e) {
                    console.log(`⚠️  Lỗi tải ảnh ${i + 1}: ${url} -> ${e.message}`);
                }
            }
        }
    }

    console.log(`🏁 Hoàn thành brand ${brandName}: ${brandProducts.length} sản phẩm`);
    return brandProducts;
}

async function main() {
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--window-position=1920,0',
            '--window-size=1920,1080'
        ]
    });
    const page = await browser.newPage();

    // Bước 1: Lấy danh sách tất cả các brand
    console.log('🔍 Đang lấy danh sách tất cả các brand...');
    await page.goto('https://mainguyenmusic.vn/pages/brand');
    
    const allBrandList = await page.evaluate(() => {
        const brandElements = document.querySelectorAll('.brands-grid-container .brands-grid .col a');
        return Array.from(brandElements).map(a => ({
            name: a.querySelector('span')?.textContent?.trim() || '',
            url: 'https://mainguyenmusic.vn' + a.getAttribute('href')
        })).filter(brand => brand.name && brand.url);
    });

    // Lọc chỉ lấy các brand trong danh sách target
    const brandList = allBrandList.filter(brand => isTargetBrand(brand.name));

    console.log(`📋 Tìm thấy ${brandList.length}/${allBrandList.length} brand phù hợp:`);
    brandList.forEach((brand, index) => {
        console.log(`   ${index + 1}. ${brand.name} - ${brand.url}`);
    });

    // Hiển thị các brand không tìm thấy
    const foundBrandNames = brandList.map(b => b.name.toLowerCase());
    const missingBrands = TARGET_BRANDS.filter(target => 
        !foundBrandNames.some(found => 
            found.includes(target.toLowerCase()) || target.toLowerCase().includes(found)
        )
    );
    
    if (missingBrands.length > 0) {
        console.log(`\n⚠️  Không tìm thấy ${missingBrands.length} brand:`);
        missingBrands.forEach(missing => console.log(`   - ${missing}`));
    }

    // Bước 2: Crawl từng brand
    let allProducts = [];
    
    for (let i = 0; i < brandList.length; i++) {
        const brand = brandList[i];
        console.log(`\n🚀 [${i + 1}/${brandList.length}] Bắt đầu crawl brand: ${brand.name}`);
        
        try {
            const brandProducts = await crawlBrandProducts(page, brand.url, brand.name);
            allProducts.push(...brandProducts);
            console.log(`✅ Hoàn thành ${brand.name}: ${brandProducts.length} sản phẩm`);
        } catch (error) {
            console.log(`❌ Lỗi khi crawl brand ${brand.name}: ${error.message}`);
        }
    }

    // Bước 3: Xuất ra file Excel
    const worksheet = XLSX.utils.json_to_sheet(allProducts.map(product => ({
        'Tên sản phẩm': product.name,
        'Giá hiện tại': extractNumber(product.priceRegular),
        'Giá gốc': extractNumber(product.priceOld),
        'Loại sản phẩm': product.productType,
        'Thương hiệu': product.brand,
        'Biến thể màu': product.colorVariants.join(', '),
        'Mô tả': product.description,
        'Ảnh': product.totalImages,
        'URL': product.productUrl
    })));

    // Tự động điều chỉnh độ rộng cột
    const colWidths = [
        { wch: 50 }, // Tên sản phẩm
        { wch: 15 }, // Giá hiện tại
        { wch: 15 }, // Giá gốc
        { wch: 20 }, // Loại sản phẩm
        { wch: 15 }, // Thương hiệu
        { wch: 25 }, // Biến thể màu
        { wch: 100 }, // Mô tả
        { wch: 10 }, // Ảnh
        { wch: 50 } // URL
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Target Brands Products');

    const fileName = `target-brands-products-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    console.log(`\n🎉 HOÀN THÀNH!`);
    console.log(`📊 Tổng cộng: ${allProducts.length} sản phẩm từ ${brandList.length} brand`);
    console.log(`💾 Đã lưu vào file: ${fileName}`);

    await browser.close();
}

main();

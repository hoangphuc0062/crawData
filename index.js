import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

async function main() {
    const browser = await puppeteer.launch({ 
        headless: false, 
        args: [
            '--window-position=1920,0',
            '--window-size=1920,1080'
        ]
    });
    const page = await browser.newPage();
    await page.goto('https://mainguyenmusic.vn/collections/vendors?q=Casio');
    
    // Lấy danh sách URL sản phẩm trước
    const productUrls = await page.evaluate(() => {
        const products = document.querySelectorAll('.prd-grid .col .prd-name a');
        return Array.from(products).map(a => a.getAttribute('href'));
    });
    
    console.log(`Số lượng sản phẩm: ${productUrls.length}`);
    
    const allProducts = [];
    
    for (const productUrl of productUrls) {
        await page.goto("https://mainguyenmusic.vn" + productUrl);
        
        const productDetail = await page.evaluate(() => {
            const productName = document.querySelector('h1.prd-block-name')?.textContent?.trim() || '';
            const priceRegular = document.querySelector('.prd-price-regular')?.textContent?.trim() || '';
            const priceOld = document.querySelector('.prd-price-old')?.textContent?.trim() || '';
            const productType = document.querySelector('p[data-render*="meta-extended"] a[href*="collections/types"]')?.textContent?.trim() || '';
            const brand = document.querySelector('p[data-render*="meta-extended"] a[href*="collections/vendors"]')?.textContent?.trim() || '';
            
            // Lấy toàn bộ HTML của phần chi tiết sản phẩm
            let description = document.querySelector('.tab-accordion-item-content.js-set-height .rte')?.innerHTML?.trim() || '';
            
            // Làm sạch và cải thiện HTML
            if (description) {
                // Loại bỏ các thẻ style không cần thiết
                description = description.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
                
                // Loại bỏ các thuộc tính style inline không cần thiết
                description = description.replace(/style="[^"]*"/gi, '');
                
                // Loại bỏ các div trống
                description = description.replace(/<div[^>]*>\s*<\/div>/gi, '');
                
                // Chuẩn hóa khoảng trắng
                description = description.replace(/\s+/g, ' ').trim();
            }
            
            return {
                name: productName,
                priceRegular: priceRegular,
                priceOld: priceOld,
                productType: productType,
                brand: brand,
                description: description
            };
        });
        
        // Kiểm tra trùng lặp trước khi thêm vào danh sách
        const isDuplicate = allProducts.some(existing => existing.name === productDetail.name);
        if (!isDuplicate && productDetail.name) {
            allProducts.push(productDetail);
        } else if (isDuplicate) {
            console.log(`⚠️  Bỏ qua sản phẩm trùng lặp: ${productDetail.name}`);
            continue;
        }
        
        console.log('=== THÔNG TIN SẢN PHẨM ===');
        console.log(`Tên: ${productDetail.name}`);
        console.log(`Giá hiện tại: ${productDetail.priceRegular}`);
        console.log(`Giá gốc: ${productDetail.priceOld}`);
        console.log(`Loại sản phẩm: ${productDetail.productType}`);
        console.log(`Thương hiệu: ${productDetail.brand}`);
        console.log(`Mô tả: ${productDetail.description ? 'Đã lấy HTML chi tiết' : 'Không có mô tả'}`);
        console.log('========================\n');
    }
    
    // Xuất ra file Excel
    const worksheet = XLSX.utils.json_to_sheet(allProducts.map(product => ({
        'Tên sản phẩm': product.name,
        'Giá hiện tại': product.priceRegular,
        'Giá gốc': product.priceOld,
        'Loại sản phẩm': product.productType,
        'Thương hiệu': product.brand,
        'Mô tả': product.description
    })));
    
    // Tự động điều chỉnh độ rộng cột
    const colWidths = [
        { wch: 50 }, // Tên sản phẩm
        { wch: 15 }, // Giá hiện tại
        { wch: 15 }, // Giá gốc
        { wch: 20 }, // Loại sản phẩm
        { wch: 15 }, // Thương hiệu
        { wch: 100 } // Chi tiết HTML
    ];
    worksheet['!cols'] = colWidths;
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sản phẩm Casio');
    
    const fileName = `casio-products-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    
    console.log(`\n✅ Đã lưu ${allProducts.length} sản phẩm vào file: ${fileName}`);
    
    await browser.close();
}

main();
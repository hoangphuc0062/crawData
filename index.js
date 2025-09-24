import puppeteer from 'puppeteer';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
    const browser = await puppeteer.launch({
        headless: false
    });
    try {
        const page = await browser.newPage();
        const targetUrl = process.env.TARGET_URL;
        await page.goto(targetUrl);
        
        // Tách danh mục từ chuỗi URL
        const urlString = targetUrl.split('/collections/')[1];
        console.log(urlString);
        const parts = urlString.split('-');
        console.log(parts);
        
        // Tìm vị trí của "lava" và tách danh mục
        const lavaIndex = parts.indexOf('lava');
        // tìm vị trí của danh mục rồi tách danh mục con lại là lava
        const categoryIndex = parts.indexOf(lavaIndex);
        
        console.log(categoryIndex);

    } catch (error) {
        console.log(error);
        await browser.close();
    }
    
})();

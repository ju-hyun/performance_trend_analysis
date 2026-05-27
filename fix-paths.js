import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const files = [
    join(__dirname, 'dist/pta/index.html'),
    join(__dirname, 'dist/pta/help.html'),
    join(__dirname, 'dist/capacity/index.html'),
    join(__dirname, 'dist/tuning/index.html')
];

files.forEach(file => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        
        // pta 디렉토리 내에 위치한 파일의 경우에만 ../pta/asserts/ -> ./asserts/ 로 보정
        if (file.includes('dist/pta/')) {
            content = content.replace(/\.\.\/pta\/asserts\//g, './asserts/');
            content = content.replace(/\.\.\/pta\/vite\.svg/g, './vite.svg');
        }
        
        fs.writeFileSync(file, content);
        console.log(`Successfully fixed paths in: ${file}`);
    } else {
        console.warn(`File not found: ${file}`);
    }
});

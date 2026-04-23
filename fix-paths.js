import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const files = [
    join(__dirname, 'dist/pta/index.html'),
    join(__dirname, 'dist/pta/help.html')
];

files.forEach(file => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        
        // 1. "../pta/asserts/"를 "./asserts/"로 변경
        // 2. "../pta/vite.svg"를 "./vite.svg"로 변경 (Vite가 자동 변환했을 경우 대비)
        content = content.replace(/\.\.\/pta\/asserts\//g, './asserts/');
        content = content.replace(/\.\.\/pta\/vite\.svg/g, './vite.svg');
        
        fs.writeFileSync(file, content);
        console.log(`Successfully fixed paths in: ${file}`);
    } else {
        console.warn(`File not found: ${file}`);
    }
});

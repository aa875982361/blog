#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import markdownpdf from 'markdown-pdf';
import { promisify } from 'util';
import hljs from 'highlight.js';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 将回调函数转换为Promise
const mkdirAsync = promisify(fs.mkdir);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

// 源目录和目标目录
const sourceDir = path.join(__dirname, '..', 'doc');
const targetDir = path.join(__dirname, '..', 'dist');
// 自定义 CSS 文件路径
const customCssPath = path.join(__dirname, '..', 'styles', 'code-styles.css');

// 递归创建目录
async function mkdirRecursive(dir) {
  if (!fs.existsSync(dir)) {
    await mkdirRecursive(path.dirname(dir));
    await mkdirAsync(dir, { recursive: true });
  }
}

// 递归处理目录
async function processDirectory(dir, relativePath = '') {
  

  const entries = await readdirAsync(dir);
  
  for (const entry of entries) {
    // 跳过隐藏文件
    if (entry.startsWith('.')) continue;
    
    const fullPath = path.join(dir, entry);
    const options = {
      // markdown-pdf使用remarkable进行预处理
      remarkable: {
        html: true,
        breaks: true,
        highlight: function (code, lang) {
          // 使用 highlight.js 进行代码高亮
          if (lang && hljs.getLanguage(lang)) {
            try {
              return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
            } catch (e) {
              console.error('代码高亮错误:', e);
            }
          }
          // 如果语言不支持或者发生错误，进行普通格式处理
          return hljs.highlightAuto(code).value;
        },
        plugins: [
          function(remarkable) {
            // 改进图片处理逻辑
            remarkable.renderer.rules.image = function(tokens, idx) {
              const token = tokens[idx];
              const alt = token.alt || '';
              let src = token.src || '';
              
              // 处理相对路径
              if (src.startsWith('../../public/images/')) {
                src = path.resolve(dir, src);
                // console.log(`Remarkable处理图片路径:${dir} ${token.src} -> ${src}`);
              }
              
              return `<img src="${src}" alt="${alt}" />`;
            };

            // 增强代码块渲染
            const originalCodeRule = remarkable.renderer.rules.code;
            remarkable.renderer.rules.code = function(tokens, idx, options, env, slf) {
              const token = tokens[idx];
              if (token.block && token.info) {
                const langName = token.info.trim().split(/\s+/g)[0];
                const langDisplay = langName ? `<div class="code-language">${langName}</div>` : '';
                const originalHtml = originalCodeRule.call(this, tokens, idx, options, env, slf);
                
                return `<div class="code-block-wrapper">${langDisplay}${originalHtml}</div>`;
              }
              
              return originalCodeRule.call(this, tokens, idx, options, env, slf);
            };
            
            // 增强引用块渲染，支持特殊类型
            const originalBlockquoteRule = remarkable.renderer.rules.blockquote_open;
            const originalBlockquoteCloseRule = remarkable.renderer.rules.blockquote_close;
            
            remarkable.renderer.rules.blockquote_open = function(tokens, idx, options, env, slf) {
              const originalHtml = originalBlockquoteRule.call(this, tokens, idx, options, env, slf);
              
              // 检查是否是特殊类型的引用块
              const nextIdx = idx + 1;
              if (nextIdx < tokens.length && tokens[nextIdx].type === 'paragraph_open' && 
                  nextIdx + 1 < tokens.length && tokens[nextIdx + 1].type === 'inline') {
                
                const text = tokens[nextIdx + 1].content;
                let blockType = '';
                
                // 根据引用块开头的文本确定类型
                if (text.startsWith('注意:') || text.startsWith('注意：') || text.startsWith('Note:')) {
                  blockType = 'note';
                } else if (text.startsWith('警告:') || text.startsWith('警告：') || text.startsWith('Warning:')) {
                  blockType = 'warning';
                } else if (text.startsWith('提示:') || text.startsWith('提示：') || text.startsWith('Tip:')) {
                  blockType = 'tip';
                } else if (text.startsWith('命令:') || text.startsWith('命令：') || text.startsWith('Command:')) {
                  blockType = 'command';
                } else if (text.match(/^注:\s+Command\s+\+\s+K/i) || text.match(/^注：\s+Command\s+\+\s+K/i)) {
                  // 匹配图片中的"注: Command + K"格式
                  blockType = 'box';
                }
                
                if (blockType) {
                  return originalHtml.replace('<blockquote>', `<blockquote class="${blockType}">`);
                }
              }
              
              return originalHtml;
            };
            
            // 处理正常引用块中可能出现的标题
            const originalHeadingRule = remarkable.renderer.rules.heading_open;
            remarkable.renderer.rules.heading_open = function(tokens, idx, options, env, slf) {
              const originalHtml = originalHeadingRule.call(this, tokens, idx, options, env, slf);
              
              // 检查当前标题是否在引用块中
              let isInBlockquote = false;
              for (let i = idx; i >= 0; i--) {
                if (tokens[i].type === 'blockquote_open') {
                  isInBlockquote = true;
                  break;
                } else if (tokens[i].type === 'blockquote_close') {
                  break;
                }
              }
              
              if (isInBlockquote) {
                // 为引用块中的标题添加特殊样式
                return originalHtml.replace(/<h(\d)/, '<h$1 class="blockquote-heading"');
              }
              
              return originalHtml;
            };
          }
        ]
      },
      // 使用自定义 CSS 样式
      cssPath: customCssPath,
      paperBorder: '1cm',
      cwd: process.cwd()
    };
    console.log('fullPath', fullPath)
    const entryRelativePath = path.join(relativePath, entry);
    const stats = await statAsync(fullPath);
    
    if (stats.isDirectory()) {
      // 如果是目录，递归处理
      await processDirectory(fullPath, entryRelativePath);
    } else if (stats.isFile() && entry.endsWith('.md')) {
      // 如果是Markdown文件，转换为PDF
      const targetPath = path.join(targetDir, relativePath);
      const pdfFilename = entry.replace(/\.md$/, '.pdf');
      const pdfPath = path.join(targetPath, pdfFilename);
      
      // 确保目标目录存在
      await mkdirRecursive(targetPath);
      
      console.log(`处理文件: ${entryRelativePath}`);
      
      try {
        // 使用 markdown-pdf 的正确 API
        await new Promise((resolve, reject) => {
          markdownpdf(options)
          .from(fullPath)
          .to(pdfPath, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        console.log(`✅ 已生成PDF: ${path.relative(process.cwd(), pdfPath)}`);
      } catch (error) {
        console.error(`❌ 转换失败: ${entryRelativePath}`, error);
      }
    }
  }
}

// 主函数
async function main() {
  console.log('开始发布过程...');
  
  try {
    // 确保目标目录存在
    await mkdirRecursive(targetDir);
    
    // 处理源目录
    await processDirectory(sourceDir);
    
    console.log('发布完成！所有Markdown文件已转换为PDF并保存到dist目录。');
  } catch (error) {
    console.error('发布过程中出现错误:', error);
    process.exit(1);
  }
}

// 执行主函数
main(); 
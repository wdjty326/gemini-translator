// import dotenv from "dotenv";
// import fs from "fs";
// import path from "path";
// import {  splitTextPatternByLineNumber } from "./util";

// dotenv.config();

// const timestamp = new Date().toISOString();

// const extractPath = path.join(__dirname, '..', process.env.EXTRACT_PATH as string);
// const translatePath = path.join(__dirname, '..', process.env.TRANSLATE_PATH as string);
// const logPath = path.join(__dirname, '..', 'logs');

// if (!fs.existsSync(extractPath)) {
//   fs.mkdirSync(extractPath, { recursive: true });
// }

// if (!fs.existsSync(translatePath)) {
//   fs.mkdirSync(translatePath, { recursive: true });
// }

// if (!fs.existsSync(logPath)) {
//   fs.mkdirSync(logPath, { recursive: true });
// }

// const translateFiles = fs.readdirSync(translatePath);
// const extractFiles = fs.readdirSync(extractPath);

// const geminiChunkSize = Number(process.env.GEMINI_CHUNK_SIZE);

// const geminiMaxTokens = Number(process.env.GEMINI_MAX_TOKENS);

// // 파일 처리 함수
// async function processFiles() {
//   console.log(extractFiles);
//   for (const file of extractFiles) {
//     try {
//       console.log(`파일 처리 중: ${file}`);
//       if (!fs.existsSync(path.join(translatePath, file))) {
//         fs.rmSync(path.join(translatePath, file), { recursive: true, force: true });
//       }
//       fs.mkdirSync(path.join(translatePath, file), { recursive: true });

//       const logFileName = `${file.replace(/\.[^/.]+$/, '')}_${timestamp.split('T')[0]}.log`;
//       const logFilePath = path.join(logPath, logFileName);

//       fs.writeFileSync(logFilePath, `[${timestamp}] 파일 처리 시작 - ${file}\n`);
//       // 파일 읽기
//       const filePath = path.join(extractPath, file);
//       const content = fs.readFileSync(filePath, 'utf8');

//       // 패턴 기반으로 텍스트 분할
//       const chunks = splitTextPatternByLineNumber(content, geminiMaxTokens);
//       console.log(`${chunks.length}개의 청크로 분할되었습니다.`);

//       // 3개의 청크씩 병렬 처리
//       for (let i = 0; i < chunks.length; i += geminiChunkSize) {
//         const currentChunks = chunks.slice(i, i + geminiChunkSize);
//         console.log(`청크 처리 중 (${Math.min(i + geminiChunkSize, chunks.length)}/${chunks.length})`);

//         const translatedChunks = await Promise.all(
//           currentChunks.map((chunk) => Promise.resolve(chunk))
//         );

//         fs.writeFileSync(path.join(translatePath, file, `${i}.txt`), translatedChunks.join(''), 'utf8');
//       }

//       console.log(`청크 분리 완료: ${file}`);
//     } catch (error) {
//       console.error(`파일 처리 중 오류 발생 (${file}):`, error);
//     }
//   }

//   console.log('모든 파일 청크 분리가 완료되었습니다.');
// }

// // 번역 프로세스 실행
// processFiles().catch(error => {
//   console.error('번역 프로세스 중 오류 발생:', error);
// });

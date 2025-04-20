import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import {  convertLineNumberToText, splitTextPatternByLineNumber } from "./util";

dotenv.config();

const timestamp = new Date().toISOString();

const extractPath = path.join(__dirname, '..', process.env.EXTRACT_PATH as string);
const translatePath = path.join(__dirname, '..', process.env.TRANSLATE_PATH as string);
const resultPath = path.join(__dirname, '..', process.env.RESULT_PATH as string);
const logPath = path.join(__dirname, '..', 'logs');

if (!fs.existsSync(extractPath)) {
  fs.mkdirSync(extractPath, { recursive: true });
}

if (!fs.existsSync(translatePath)) {
  fs.mkdirSync(translatePath, { recursive: true });
}

if (!fs.existsSync(logPath)) {
  fs.mkdirSync(logPath, { recursive: true });
}

if (!fs.existsSync(resultPath)) {
  fs.mkdirSync(resultPath, { recursive: true });
}

const extractFiles = fs.readdirSync(extractPath);
const translateFiles = fs.readdirSync(translatePath);

const geminiChunkSize = Number(process.env.GEMINI_CHUNK_SIZE);

const geminiMaxTokens = Number(process.env.GEMINI_MAX_TOKENS);

// 파일 처리 함수
async function processFiles() {
  console.log(extractFiles);
  for (const file of extractFiles) {
    try {
      console.log(`파일 처리 중: ${file}`);
      let originalText = fs.readFileSync(path.join(extractPath, file), 'utf8');
      const complateFiles = fs.readdirSync(path.join(translatePath, file)).filter(file => file.includes('_complate_'));
      console.log(`[${timestamp}] 파일 처리 시작 - ${file}\n`)

      for (const complateFile of complateFiles) {
        console.log(`[${timestamp}] 파일 처리 중 - ${complateFile}`);
        const complateText = fs.readFileSync(path.join(translatePath, file, complateFile), 'utf8');
        originalText = convertLineNumberToText(originalText, complateText);
      }

      console.log(`[${timestamp}] 파일 처리 완료 - ${file}`);
      fs.writeFileSync(path.join(resultPath, file), originalText, 'utf8');
    } catch (error) {
      console.error(`파일 처리 중 오류 발생 (${file}):`, error);
    }
  }
}

// 번역 프로세스 실행
processFiles().catch(error => {
  console.error('번역 프로세스 중 오류 발생:', error);
});

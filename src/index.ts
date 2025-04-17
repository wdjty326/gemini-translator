import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const timestamp = new Date().toISOString();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL as string });

const extractPath = path.join(__dirname, '..', process.env.EXTRACT_PATH as string);
const translatePath = path.join(__dirname, '..', process.env.TRANSLATE_PATH as string);
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

const translateFiles = fs.readdirSync(translatePath);
const extractFiles = fs.readdirSync(extractPath).filter(file => !translateFiles.includes(file));

const geminiDelayTime = Number(process.env.GEMINI_DELAY_TIME);
const geminiChunkSize = Number(process.env.GEMINI_CHUNK_SIZE);


// 번역 함수 정의
async function translateJapaneseToKorean(text: string, fileName: string, chunkIndex: number, tryCount: number = 0) {
  const logFileName = `${fileName.replace(/\.[^/.]+$/, '')}_${timestamp.split('T')[0]}.log`;
  const logFilePath = path.join(logPath, logFileName);

  const textLines = text.split('\n')
  // 로그 시작
  const startLog = `[${timestamp}] 번역 시작 - 파일: ${fileName}, 청크: ${chunkIndex}, 라인: ${textLines.length}\n\n`;
  fs.appendFileSync(logFilePath, startLog);
  // const prompt = `일본어 텍스트를 한국어로 번역해주세요. 원문의 의미와 뉘앙스를 유지하면서 자연스러운 한국어로 번역해주세요. 설명이나 다른 내용 없이 오직 일본어만 번역 해주세요. "--- 101 ---" 또는 "--- 102 ---" 또는 "-----" 패턴을 유지해주세요. 원문에 없는 내용을 추가 혹은 제거하지마세요. 줄바꿈도 원문과 동일하게 유지해주세요.:\n\n${text}`;
  const prompt = `Please translate the following Japanese text to Korean. Maintain the original meaning and nuance while providing a natural Korean translation. Only translate the Japanese text without adding any explanations or additional content. Preserve the patterns "--- 101 ---", "--- 102 ---", or "-----". Do not add or remove any content that is not in the original text. Keep the line breaks exactly as they are in the original text:\n\n${text}`;
  try {

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{
          text: prompt,
        }],
      }],
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    });
    const response = await result.response;
    const translatedText = response.text();

    const translatedLines = translatedText.split('\n')

    if (translatedLines.length === textLines.length) {
      // 번역 결과 로그
      const endLog = `[${new Date().toISOString()}] 번역 완료 - 파일: ${fileName}, 청크: ${chunkIndex}, 라인: ${translatedLines.length}\n\n`;
      fs.appendFileSync(logFilePath, endLog);
      return translatedText
    } else if (translatedLines.length - 1 === textLines.length && translatedLines[translatedLines.length - 2] === "--- 101 ---") { // 간혈적으로 발생하는 오번역 패턴(마지막 라인에 "--- 101 ---" 추가)
      const errorLog = `[${new Date().toISOString()}] 오번역 발생 - 파일: ${fileName}, 청크: ${chunkIndex}, 원문 라인: ${textLines.length}, 번역 라인: ${translatedLines.length}\n\n원문:\n${text}\n\n번역 결과:\n${translatedText}\n\n`;
      fs.appendFileSync(logFilePath, errorLog);
      translatedLines.splice(translatedLines.length - 2, 1)
      return translatedLines.join('\n')
    } else if (tryCount < 3) {
      console.error('비정상 번역 발생하여 재번역을 요청합니다.')
      const errorLog = `[${new Date().toISOString()}] 비정상 번역 발생 - 파일: ${fileName}, 청크: ${chunkIndex}, 원문 라인: ${textLines.length}, 번역 라인: ${translatedLines.length}\n\n원문:\n${text}\n\n번역 결과:\n${translatedText}\n\n`;
      fs.appendFileSync(logFilePath, errorLog);
      await new Promise(resolve => setTimeout(resolve, geminiDelayTime));
      return await translateJapaneseToKorean(text, fileName, chunkIndex, tryCount + 1)
    } else {
      console.error('비정상 번역 발생하여 원문을 유지합니다.')
      const errorLog = `[${new Date().toISOString()}] 비정상 번역 발생 - 파일: ${fileName}, 청크: ${chunkIndex}, 원문 라인: ${textLines.length}, 번역 라인: ${translatedLines.length}\n\n원문:\n${text}\n\n번역 결과:\n${translatedText}\n\n`;
      fs.appendFileSync(logFilePath, errorLog);
      return text
    }
  } catch (error) {
    console.error(error);
    console.error('번역 중 오류 발생하여 원문을 유지합니다.')
      const errorLog = `[${new Date().toISOString()}] 번역 중 오류 발생 - 파일: ${fileName}, 청크: ${chunkIndex}`;
      fs.appendFileSync(logFilePath, errorLog);
      return text
  }
}

// 텍스트 분할 함수 - 패턴 기반 분할
function splitTextByPattern(text: string): string[] {
  // "--- 101 ---" 또는 "--- 102 ---" 또는 "-----" 패턴으로 분할
  const pattern = /(?:---(?: \d+ ---)|-----)/g;
  const matches = [...text.matchAll(pattern)];
  const chunks: string[] = [];

  // 청크 크기 제한 (대략적인 크기)
  const MAX_CHUNK_SIZE = Number(process.env.GEMINI_MAX_TOKENS);
  let currentChunk = "";
  let lastIndex = 0;

  // 패턴 매칭 위치를 기준으로 분할
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const matchIndex = match.index!;

    // 현재 매치까지의 텍스트 추출
    const segment = text.substring(lastIndex, matchIndex);

    // 청크 크기가 제한을 초과하면 새 청크 시작
    if (currentChunk.length + segment.length > MAX_CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = segment;
    } else {
      currentChunk += segment;
    }

    lastIndex = matchIndex
  }

  // 마지막 청크 추가
  if (lastIndex < text.length) {
    const lastSegment = text.substring(lastIndex);

    if (currentChunk.length + lastSegment.length > MAX_CHUNK_SIZE) {
      chunks.push(currentChunk);
      chunks.push(lastSegment);
    } else {
      currentChunk += lastSegment;
      chunks.push(currentChunk);
    }
  } else if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// 파일 처리 함수
async function processFiles() {
  console.log(extractFiles);
  for (const file of extractFiles) {
    try {
      console.log(`파일 처리 중: ${file}`);

      const logFileName = `${file.replace(/\.[^/.]+$/, '')}_${timestamp.split('T')[0]}.log`;
      const logFilePath = path.join(logPath, logFileName);

      fs.writeFileSync(logFilePath, `[${timestamp}] 파일 처리 시작 - ${file}\n`);
      // 파일 읽기
      const filePath = path.join(extractPath, file);
      const content = fs.readFileSync(filePath, 'utf8');

      // 패턴 기반으로 텍스트 분할
      const chunks = splitTextByPattern(content);
      console.log(`${chunks.length}개의 청크로 분할되었습니다.`);

      let translatedContent = '';

      // 3개의 청크씩 병렬 처리
      for (let i = 0; i < chunks.length; i += geminiChunkSize) {
        const currentChunks = chunks.slice(i, i + geminiChunkSize);
        console.log(`청크 처리 중 (${Math.min(i + geminiChunkSize, chunks.length)}/${chunks.length})`);

        const translatedChunks = await Promise.all(
          currentChunks.map((chunk, index) => translateJapaneseToKorean(chunk, file, i + index))
        );

        translatedContent += translatedChunks.join('');
        await new Promise(resolve => setTimeout(resolve, geminiDelayTime));
      }

      // 번역된 내용 저장
      const outputPath = path.join(translatePath, file);
      fs.writeFileSync(outputPath, translatedContent, 'utf8');
      console.log(`번역 완료: ${file}`);
    } catch (error) {
      console.error(`파일 처리 중 오류 발생 (${file}):`, error);
    }
  }

  console.log('모든 파일 번역이 완료되었습니다.');
}

// 번역 프로세스 실행
processFiles().catch(error => {
  console.error('번역 프로세스 중 오류 발생:', error);
});

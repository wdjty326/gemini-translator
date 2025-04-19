import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { convertLineNumberToText, splitTextPatternByDefault, splitTextPatternByLineNumber } from "./util";
import { defaultPromptWithKR, lineNumberPromptWithKR } from "./prompt";

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

const geminiMaxTokens = Number(process.env.GEMINI_MAX_TOKENS);

// 번역 함수 정의
async function translateJapaneseToKorean(text: string, fileName: string, chunkIndex: number, tryCount: number = 0) {
  const logFileName = `${fileName.replace(/\.[^/.]+$/, '')}_${timestamp.split('T')[0]}.log`;
  const logFilePath = path.join(logPath, logFileName);

  const textLines = text.split('\n')
  // 로그 시작
  const startLog = `[${timestamp}] 번역 시작 - 파일: ${fileName}, 청크: ${chunkIndex}, 라인: ${textLines.length}\n\n`;
  fs.appendFileSync(logFilePath, startLog);
  const prompt = `${lineNumberPromptWithKR}\n\n${text}`
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
      const endLog = `[${new Date().toISOString()}] 번역 완료 - 파일: ${fileName}, 청크: ${chunkIndex}, 라인: ${translatedLines.length}\n\n\n\n원문:\n${text}\n\n번역 결과:\n${translatedText}\n\n`;
      fs.appendFileSync(logFilePath, endLog);
      return translatedText
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
    console.error(`[${new Date().toISOString()}] 번역 중 오류 발생 - 파일: ${fileName}, 청크: ${chunkIndex}. 청크 분할 재시도 중...`);
    const errorLog = `[${new Date().toISOString()}] 번역 중 오류 발생 - 파일: ${fileName}, 청크: ${chunkIndex}. 청크 분할 재시도 시작.\n${error}\n`;
    // fs.appendFileSync(logFilePath, errorLog); // logFilePath 변수가 이 스코프에 없으므로 주석 처리. 필요 시 로깅 방식 수정 필요.

    const lines = text.split('\n');
    const totalLines = lines.length;
    // 라인 수가 4개 미만일 경우, 더 이상 나눌 수 없으므로 원본 반환 (무한 재귀 방지)
    if (totalLines < 4) {
        console.error(`[${new Date().toISOString()}] 라인 수가 4개 미만(${totalLines}줄)이라 청크 분할 재시도 불가 - 파일: ${fileName}, 청크: ${chunkIndex}. 원본 반환.`);
        const errorLogLessLines = `[${new Date().toISOString()}] 라인 수가 4개 미만(${totalLines}줄)이라 청크 분할 재시도 불가 - 파일: ${fileName}, 청크: ${chunkIndex}. 원본 반환.\n`;
        // fs.appendFileSync(logFilePath, errorLogLessLines); // logFilePath 변수가 이 스코프에 없으므로 주석 처리.
        return text;
    }

    const chunkSize = Math.ceil(totalLines / 4);
    let translatedChunks: string[] = [];
    let retrySuccess = true;

    for (let i = 0; i < 4; i++) {
        const startLine = i * chunkSize;
        const endLine = Math.min((i + 1) * chunkSize, totalLines);
        if (startLine >= endLine) continue;

        const chunkText = lines.slice(startLine, endLine).join('\n');
        const chunkLogPrefix = `[${new Date().toISOString()}] 재번역 (청크 ${i + 1}/4) - 파일: ${fileName}, 원본 청크: ${chunkIndex}`;

        try {
            console.log(`${chunkLogPrefix}: 재번역 시도 중...`);
            await new Promise(resolve => setTimeout(resolve, geminiDelayTime)); // 재시도 딜레이
            // 재번역 시도. 재귀 호출 대신 tryCount를 매우 높은 값으로 설정하여 추가 재귀 방지
            const translatedChunk = await translateJapaneseToKorean(chunkText, fileName, chunkIndex, 99); // 99는 임의의 높은 값
            translatedChunks.push(translatedChunk);
            const successLog = `${chunkLogPrefix}: 재번역 성공.\\n`;
            // fs.appendFileSync(logFilePath, successLog); // logFilePath 변수가 이 스코프에 없으므로 주석 처리.
            console.log(`${chunkLogPrefix}: 재번역 성공.`);
        } catch (retryError) {
            console.error(`${chunkLogPrefix}: 재번역 실패. 원본 청크 유지.`);
            const retryErrorLog = `${chunkLogPrefix}: 재번역 실패. 원본 청크 유지.\n${retryError}\n`;
            // fs.appendFileSync(logFilePath, retryErrorLog); // logFilePath 변수가 이 스코프에 없으므로 주석 처리.
            translatedChunks.push(chunkText); // 실패 시 원본 청크 텍스트 사용
            retrySuccess = false; // 하나라도 실패하면 실패로 기록
        }
    }

    const finalResult = translatedChunks.join('\n');

    if (retrySuccess) {
        console.log(`[${new Date().toISOString()}] 청크 분할 재번역 성공 - 파일: ${fileName}, 청크: ${chunkIndex}`);
        const successLog = `[${new Date().toISOString()}] 청크 분할 재번역 성공 - 파일: ${fileName}, 청크: ${chunkIndex}.\n`;
        // fs.appendFileSync(logFilePath, successLog); // logFilePath 변수가 이 스코프에 없으므로 주석 처리.
    } else {
        console.error(`[${new Date().toISOString()}] 청크 분할 재번역 부분 실패 (일부 원본 유지) - 파일: ${fileName}, 청크: ${chunkIndex}`);
        const partialFailLog = `[${new Date().toISOString()}] 청크 분할 재번역 부분 실패 (일부 원본 유지) - 파일: ${fileName}, 청크: ${chunkIndex}.\n`;
        // fs.appendFileSync(logFilePath, partialFailLog); // logFilePath 변수가 이 스코프에 없으므로 주석 처리.
    }

    return finalResult; // 성공했든 부분 실패했든 조합된 결과 반환
  }
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
      const chunks = splitTextPatternByLineNumber(content, geminiMaxTokens);
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

      // 라인 번호 기반으로 번역된 내용 수정
      translatedContent = convertLineNumberToText(content, translatedContent);

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

const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.API_KEY);

const model = genAI.getGenerativeModel({ model: process.env.MODEL, });

const extractPath = path.join(__dirname, '..', process.env.EXTRACT_PATH);
const translatePath = path.join(__dirname, '..', process.env.TRANSLATE_PATH);

if (!fs.existsSync(extractPath)) {
  fs.mkdirSync(extractPath, { recursive: true });
}

if (!fs.existsSync(translatePath)) {
  fs.mkdirSync(translatePath, { recursive: true });
}

const extractFiles = fs.readdirSync(extractPath);
const translateFiles = fs.readdirSync(translatePath);

// 번역 함수 정의
async function translateJapaneseToKorean(text: string) {
  const prompt = `다음 일본어 텍스트를 한국어로 번역해주세요. 원문의 의미와 뉘앙스를 최대한 유지하면서 자연스러운 한국어로 번역해주세요:\n\n${text}`;
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

// 텍스트 분할 함수 - 패턴 기반 분할
function splitTextByPattern(text: string): string[] {
  // "--- 101 ---" 또는 "--- 102 ---" 패턴으로 분할
  const pattern = /---(?: \d+ ---)/g;
  const matches = [...text.matchAll(pattern)];
  const chunks: string[] = [];
  
  // 청크 크기 제한 (대략적인 크기)
  const MAX_CHUNK_SIZE = 10000;
  let currentChunk = "";
  let lastIndex = 0;
  
  // 패턴 매칭 위치를 기준으로 분할
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const matchIndex = match.index!;
    const matchText = match[0];
    
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
      
      // 파일 읽기
      const filePath = path.join(extractPath, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // 패턴 기반으로 텍스트 분할
      const chunks = splitTextByPattern(content);
      console.log(`${chunks.length}개의 청크로 분할되었습니다.`);
      
      let translatedContent = '';
      
      // 각 청크 번역
      for (let i = 0; i < chunks.length; i++) {
        console.log(`청크 처리 중 (${i+1}/${chunks.length})`);
        const translatedChunk = await translateJapaneseToKorean(chunks[i]);
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.max(5, Math.random() * 10)));
        translatedContent += translatedChunk;
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

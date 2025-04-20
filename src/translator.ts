// import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { lineNumberPromptWithKR } from "./prompt";

dotenv.config();

const timestamp = new Date().toISOString();
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY as string
});

const translatePath = path.join(__dirname, '..', process.env.TRANSLATE_PATH as string);
const logPath = path.join(__dirname, '..', 'logs');

if (!fs.existsSync(translatePath)) {
    fs.mkdirSync(translatePath, { recursive: true });
}

if (!fs.existsSync(logPath)) {
    fs.mkdirSync(logPath, { recursive: true });
}

const translateDirs = fs.readdirSync(translatePath);

const geminiDelayTime = Number(process.env.GEMINI_DELAY_TIME);
const geminiChunkSize = Number(process.env.GEMINI_CHUNK_SIZE);


// 번역 함수 정의
async function translateJapaneseToKorean(text: string, fileName: string, chunkIndex: number, tryCount: number = 0) {
    const logFileName = `${fileName.replace(/\.[^/.]+$/, '')}_${timestamp.split('T')[0]}.log`;
    const logFilePath = path.join(logPath, logFileName);

    const textLines = text.split('\n')
    // 로그 시작
    const startLog = `[${timestamp}] 번역 시작 - 파일: ${fileName}, 청크: ${chunkIndex}, 라인: ${textLines.length}\n`;
    fs.appendFileSync(logFilePath, startLog);
    console.debug(`[${timestamp}] 번역 시작 - 파일: ${fileName}`);
    const prompt = `${lineNumberPromptWithKR}\n${text}`
    try {
        const result = await ai.models.generateContent({
            model: process.env.GEMINI_MODEL as string,
            contents: prompt,
            config: {
                thinkingConfig: {
                    thinkingBudget: 0, // 추론을 사용하지 않음
                },
                temperature: 1,
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
            }
        });

        const translatedText = result.text || '';

        const translatedLines = translatedText.split('\n').filter(line => line.length > 0)
        if (translatedLines.length === textLines.length) {
            // 번역 결과 로그
            const endLog = `[${new Date().toISOString()}] 번역 완료 - 파일: ${fileName}, 청크: ${chunkIndex}, 라인: ${translatedLines.length}\n원문:\n${text}\n번역 결과:\n${translatedText}\n`;
            fs.appendFileSync(logFilePath, endLog);
            console.debug(`[${new Date().toISOString()}] 번역 완료 - 파일: ${fileName}`);
            return translatedText
        } else if (translatedText.length === 0) {
            throw new Error('번역요청에 실패하여 청크를 재분리합니다.')
        } else if (tryCount < 1) {
            console.error('비정상 번역 발생하여 재번역을 요청합니다.')
            const errorLog = `[${new Date().toISOString()}] 비정상 번역 발생 - 파일: ${fileName}, 청크: ${chunkIndex}, 원문 라인: ${textLines.length}, 번역 라인: ${translatedLines.length}\n원문:\n${text}\n번역 결과:\n${translatedText}\n`;
            fs.appendFileSync(logFilePath, errorLog);
            console.debug(errorLog);
            await new Promise(resolve => setTimeout(resolve, geminiDelayTime));
            return await translateJapaneseToKorean(text, fileName, chunkIndex, tryCount + 1)
        } else {
            throw new Error('번역요청에 실패하여 청크를 재분리합니다.')
            // console.error('비정상 번역 발생하여 원문을 유지합니다.')
            // const errorLog = `[${new Date().toISOString()}] 비정상 번역 발생 - 파일: ${fileName}, 청크: ${chunkIndex}, 원문 라인: ${textLines.length}, 번역 라인: ${translatedLines.length}\n원문:\n${text}\n번역 결과:\n${translatedText}\n`;
            // fs.appendFileSync(logFilePath, errorLog);
            // console.debug(errorLog);
            // return text
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] 번역 중 오류 발생 - 파일: ${fileName}, 청크: ${chunkIndex}. 청크 분할 재시도 중...`);
        const errorLog = `[${new Date().toISOString()}] 번역 중 오류 발생 - 파일: ${fileName}, 청크: ${chunkIndex}. 청크 분할 재시도 시작.\n${error}\n`;
        fs.appendFileSync(logFilePath, errorLog); // logFilePath 변수가 이 스코프에 없으므로 주석 처리. 필요 시 로깅 방식 수정 필요.

        const lines = text.split('\n');
        const totalLines = lines.length;
        // 라인 수가 4개 미만일 경우, 더 이상 나눌 수 없으므로 원본 반환 (무한 재귀 방지)
        if (totalLines < 4) {
            console.error(`[${new Date().toISOString()}] 라인 수가 4개 미만(${totalLines}줄)이라 청크 분할 재시도 불가 - 파일: ${fileName}, 청크: ${chunkIndex}. 원본 반환.`);
            return text;
        }

        const chunkSize = Math.ceil(totalLines / 10);
        let translatedChunks: string[] = [];
        let retrySuccess = true;

        for (let i = 0; i < 10; i++) {
            const startLine = i * chunkSize;
            const endLine = Math.min((i + 1) * chunkSize, totalLines);
            if (startLine >= endLine) continue;

            const chunkText = lines.slice(startLine, endLine).join('\n');
            const chunkLogPrefix = `[${new Date().toISOString()}] 재번역 (청크 ${i + 1}/${10}) - 파일: ${fileName}, 원본 청크: ${chunkIndex}`;

            try {
                console.log(`${chunkLogPrefix}: 재번역 시도 중...`);
                // 재번역 시도. 재귀 호출 대신 tryCount를 매우 높은 값으로 설정하여 추가 재귀 방지
                const translatedChunk = await translateJapaneseToKorean(chunkText, fileName, chunkIndex, 99); // 99는 임의의 높은 값
                translatedChunks.push(translatedChunk);
                console.log(`${chunkLogPrefix}: 재번역 성공.`);
            } catch (retryError) {
                console.error(`${chunkLogPrefix}: 재번역 실패. 원본 청크 유지.`);
                translatedChunks.push(chunkText); // 실패 시 원본 청크 텍스트 사용
                retrySuccess = false; // 하나라도 실패하면 실패로 기록
            }
        }

        const finalResult = translatedChunks.join('\n');

        if (retrySuccess) {
            console.log(`[${new Date().toISOString()}] 청크 분할 재번역 성공 - 파일: ${fileName}, 청크: ${chunkIndex}`);
        } else {
            console.error(`[${new Date().toISOString()}] 청크 분할 재번역 부분 실패 (일부 원본 유지) - 파일: ${fileName}, 청크: ${chunkIndex}`);
        }

        return finalResult; // 성공했든 부분 실패했든 조합된 결과 반환
    }
}

// 파일 처리 함수
async function processFiles() {
    console.log(translateDirs);
    for (const dir of translateDirs) {
        const files = fs.readdirSync(path.join(translatePath, dir)).filter(file => !file.includes('_complate_') && !file.includes('_failed_'));
        console.log(`번역 처리 중: ${dir} ${files.length}개의 파일`);
        for (let i = 0; i < files.length; i += geminiChunkSize) {
            const currentFiles = files.slice(i, i + geminiChunkSize);

            const translatedChunks = await Promise.all(
                currentFiles.map(async (file) => {
                    const complateFile = path.join(translatePath, dir, `_complate_${file}`);
                    if (fs.existsSync(complateFile)) {
                        console.log(`${file} 기존 번역 데이터가 있습니다.`);
                        return fs.readFileSync(complateFile, 'utf8');
                    }
                    const text = fs.readFileSync(path.join(translatePath, dir, file), 'utf8');
                    const translatedText = await translateJapaneseToKorean(text, `${dir}-${file}`, 0, 0);
                    return translatedText;
                })
            );

            for (let i = 0; i < translatedChunks.length; i++) {
                if (/[ぁ-ゔ]+|[ァ-ヴー]+[々〆〤]/g.test(translatedChunks[i])) {
                    console.error(`${currentFiles[i]} 청크 번역 결과 오류 발생 - \n번역 결과:\n${`_failed_${currentFiles[i]}`}`);
                    fs.writeFileSync(path.join(translatePath, dir, `_failed_${currentFiles[i]}`), translatedChunks[i], 'utf8');
                } else {
                    fs.writeFileSync(path.join(translatePath, dir, `_complate_${currentFiles[i]}`), translatedChunks[i], 'utf8');
                }
            }
        }
    }

    console.log('모든 파일 번역이 완료되었습니다.');
}

// 번역 프로세스 실행
processFiles().catch(error => {
    console.error('번역 프로세스 중 오류 발생:', error);
});

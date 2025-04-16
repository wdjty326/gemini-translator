# Gemini AI 번역기입니다.

Tsukuru Extractor 을 Gemini로 번역하는 툴입니다.
오직 MZ/MV 기준에서만 동작합니다.


## 사용방법
사용전 NodeJS 22 버전이 필수로 사용됩니다. 아래 링크에서 NodeJS를 설치해주세요 
https://nodejs.org/ko/

NodeJS 설치가 완료되었으면, Pnpm 도 동일하게 설치해주세요
https://pnpm.io/ko/installation

```
# 패키지 설치
pnpm install

# 빌드
pnpm build
```

.env 파일을 생성합니다.

```
# .env
EXTRACT_PATH=./extract
TRANSLATE_PATH=./translate

# Gemini API Key
GEMINI_API_KEY=본인이사용하는키

# Gemini Model
GEMINI_MODEL=gemini-2.0-flash-lite

# Gemini Prompt Template
GEMINI_PROMPT_TEMPLATE=

# Gemini Max Tokens
# PROHIBITED_CONTENT 발생시 번역하는 토큰 수 조절
# GEMINI_MAX_TOKENS=10000
# GEMINI_MAX_TOKENS=5000
GEMINI_MAX_TOKENS=2000

# Gemini Delay Time
GEMINI_DELAY_TIME=5000

GEMINI_CHUNK_SIZE=3
```
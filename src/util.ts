const lineNumberSeparator = ': '

export const convertLineNumberToText = (originalText: string, translatedText: string) => {
    const originalLines = originalText.split('\n')
    translatedText.split('\n').forEach(line => {
        const index = line.indexOf(lineNumberSeparator)
        if (index === -1) return // 없으면 무시

        const lineNumber = Number(line.substring(0, index)) - 1
        if (!isNaN(lineNumber) && lineNumber < 0 || lineNumber >= originalLines.length) return // 범위 밖이면 무시

        if (!line) return // 빈 라인이면 무시

        const text = line.substring(index + lineNumberSeparator.length)
        originalLines[lineNumber] = text.replace(/\$\{(\d):(\d+)\}/g, (p0, p1, p2) => `${p1 === '0' ? '\\n' : '\\N'}[${p2}]`)
    })

    return originalLines.join('\n')
}

// 텍스트 분할 함수 - 라인 번호 기반 분할
export const splitTextPatternByLineNumber = (text: string, size: number) => {
    const pattern = /(?:---(?: \d+ ---)|-----)/g;
    const chunks: string[] = [];
    const lines = text.split('\n')
    let plainText = ''

    // 청크 크기 제한 (대략적인 크기)
    //  const MAX_CHUNK_SIZE = Number(process.env.GEMINI_MAX_TOKENS);

    for (let i = 0; i < lines.length; i++) {
        const lineNumber = i + 1
        const line = lines[i];
        if (plainText.length + line.length > size && plainText.length > 0) {
            chunks.push(plainText);
            plainText = '';
        } else if (!pattern.test(line)) {
            plainText += `${lineNumber}${lineNumberSeparator}${line.replace(/(\\n|\\N)\[(\d+)\]/g, (p0, p1, p2) => '${' + (p1 === '\\n' ? 0 : 1) + ':' + p2 + '}')}\n`;
        }
    }

    if (plainText.length > 0) {
        chunks.push(plainText);
    }

    return chunks;
}

// 텍스트 분할 함수 - 패턴 기반 분할
export const splitTextPatternByDefault = (text: string) => {
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
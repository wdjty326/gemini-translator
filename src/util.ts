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
        originalLines[lineNumber] = text.replace(/\$\{(n|N)(\d{1,})\}/g, (_, p1, p2) => `\\${p1}[${p2}]`)
    })

    return originalLines.join('\n')
}

// 텍스트 분할 함수 - 라인 번호 기반 분할
export const splitTextPatternByLineNumber = (text: string, size: number) => {
    const chunks: string[] = [];
    const lines = text.split('\n')
    let plainText = ''

    // 청크 크기 제한 (대략적인 크기)
    //  const MAX_CHUNK_SIZE = Number(process.env.GEMINI_MAX_TOKENS);

    for (let i = 0; i < lines.length; i++) {
        const lineNumber = i + 1
        const line = lines[i];
        if (plainText.length + line.length > size && plainText.length > 0) {
            chunks.push(plainText.substring(0, plainText.length - 1));
            plainText = '';
        } else if (!/(?:---(?: \d+ ---)|-----)/.test(line) && !/^\\n|N\[(\d{1,})\]$/.test(line) && line.length > 0) {
            plainText += `${lineNumber}${lineNumberSeparator}${line.replace(/\\(n|N)\[(\d+)\]/g, (_, p1, p2) => `\${${p1}${p2}}`)}\n`;
        }
    }

    if (plainText.length > 0) {
        chunks.push(plainText.substring(0, plainText.length - 1));
    }

    return chunks;
}

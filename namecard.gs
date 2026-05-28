// namecard.gs

const CONFIG = {
  FOLDER_NAME: 'Namecard_Images',
  DONE_FOLDER: 'Namecard_Done',
  SHEET_NAME: 'db_namecards',
  LOG_SHEET: 'processed_log',
  GEMINI_MODEL: 'gemini-3.1-flash-lite',
  // ⚠️ 아래 키를 본인 Gemini API Key로 교체
  GEMINI_API_KEY: 'GEMINI_API_KEY',
};

// ─── 트리거 진입점 ───────────────────────────────────────────
function scanNewNamecards() {
  const folder = getDriveFolder(CONFIG.FOLDER_NAME);
  if (!folder) {
    console.log('❌ 폴더를 찾을 수 없습니다: ' + CONFIG.FOLDER_NAME);
    return;
  }
  console.log('✅ 폴더 발견: ' + folder.getName());

  const processedIds = getProcessedIds();
  console.log('📋 처리된 파일 수: ' + processedIds.size);

  const files = folder.getFiles();
  let total = 0, count = 0;

  while (files.hasNext()) {
    const file = files.next();
    total++;
    const isImg = isImageFile(file);
    const isDone = processedIds.has(file.getId());
    console.log(`파일: ${file.getName()} | 이미지: ${isImg} | 처리됨: ${isDone}`);

    if (isDone || !isImg) continue;

    try {
      processNamecard(file);
      markAsProcessed(file.getId());
      count++;
    } catch (e) {
      console.log(`❌ [${file.getName()}] 처리 실패: ${e.message}`);
      console.log('스택: ' + e.stack);
    }
  }
  console.log(`📊 전체: ${total}개 | 처리 완료: ${count}개`);
}

// ─── 명함 1장 처리 ───────────────────────────────────────────
function processNamecard(file) {
  const base64Image = Utilities.base64Encode(file.getBlob().getBytes());
  const mimeType = file.getMimeType();
  const parsed = callGeminiOCR(base64Image, mimeType);

  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  const imageUrl = `https://drive.google.com/uc?id=${file.getId()}`;

  if (isDuplicate(parsed.phone, parsed.mobile, parsed.email)) {
    console.log(`⚠️ 중복 감지: ${parsed.name}`);
    updateExistingRow(parsed, imageUrl);
  } else {
    appendToSheet(parsed, imageUrl);
  }

  moveFileToDone(file);
}

// ─── Gemini API OCR ──────────────────────────────────────────
function callGeminiOCR(base64Image, mimeType) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

  const systemPrompt = `명함 이미지를 분석하여 아래 JSON만 출력하세요. 다른 텍스트, 설명, 마크다운 절대 금지.
{
  "company": "회사명",
  "name": "이름",
  "title": "직책",
  "phone": "회사 대표전화 또는 직통번호 (숫자와 - 만, 없으면 빈 문자열)",
  "mobile": "휴대폰번호 M. 또는 Mobile 항목 (숫자와 - 만, 없으면 빈 문자열)",
  "email": "이메일",
  "address": "주소"
}
phone은 T. 또는 Tel. 항목, mobile은 M. 또는 Mobile. 항목. 값 없으면 빈 문자열. JSON만 출력.`;

  const payload = {
    contents: [{
      parts: [
        { text: systemPrompt },
        { inline_data: { mime_type: mimeType, data: base64Image } }
      ]
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 512 }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'POST', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });

  const result = JSON.parse(response.getContentText());
  if (response.getResponseCode() !== 200) {
    throw new Error('Gemini API 오류: ' + JSON.stringify(result));
  }

  const rawText = result.candidates[0].content.parts[0].text;
  console.log('Gemini 응답 원문:', rawText);

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('JSON 추출 실패: ' + rawText.substring(0, 100));

  return JSON.parse(jsonMatch[0]);
}

// ─── Sheets 조작 ─────────────────────────────────────────────
function appendToSheet(parsed, imageUrl) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  const id = Utilities.getUuid();
  const now = new Date().toISOString();

  sheet.appendRow([
    id, now,
    parsed.company ?? '',
    parsed.name    ?? '',
    parsed.title   ?? '',
    parsed.phone   ?? '',
    parsed.mobile  ?? '',   // 휴대폰 추가
    parsed.email   ?? '',
    parsed.address ?? '',
    imageUrl,
    'OK'
  ]);
}

function updateExistingRow(parsed, imageUrl) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (
      (parsed.phone  && data[i][5] === parsed.phone)  ||
      (parsed.mobile && data[i][6] === parsed.mobile) ||
      (parsed.email  && data[i][7] === parsed.email)
    ) {
      const row = i + 1;
      sheet.getRange(row, 3, 1, 8).setValues([[
        parsed.company ?? '',
        parsed.name    ?? '',
        parsed.title   ?? '',
        parsed.phone   ?? '',
        parsed.mobile  ?? '',
        parsed.email   ?? '',
        parsed.address ?? '',
        imageUrl
      ]]);
      sheet.getRange(row, 11).setValue('UPDATED');
      return;
    }
  }
}

function isDuplicate(phone, mobile, email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (
      (phone  && data[i][5] === phone)  ||
      (mobile && data[i][6] === mobile) ||
      (email  && data[i][7] === email)
    ) return true;
  }
  return false;
}

// ─── 처리 로그 ───────────────────────────────────────────────
function getProcessedIds() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.LOG_SHEET);
  const data = sheet.getDataRange().getValues();
  return new Set(data.slice(1).map(r => r[0]));
}

function markAsProcessed(fileId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.LOG_SHEET);
  sheet.appendRow([fileId, new Date().toISOString()]);
}

// ─── 유틸 ────────────────────────────────────────────────────
function getDriveFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : null;
}

function isImageFile(file) {
  const mime = file.getMimeType();
  return mime.startsWith('image/') || mime === 'application/pdf';
}

// onChange 이벤트 �核심: 변경된 파일이 대상 폴더 소속인지 확인
function onDriveChange(e) {
  // e.changeType: 'CREATE' | 'EDIT' | 'TRASH' | 'UNTRASH'
  if (e.changeType !== 'CREATE') return;

  const file = DriveApp.getFileById(e.fileId);
  if (!isImageFile(file)) return;

  // 대상 폴더 소속 여부 확인
  const targetFolder = getDriveFolder(CONFIG.FOLDER_NAME);
  if (!targetFolder) return;

  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === targetFolder.getId()) {
      // 대상 폴더 파일 → 즉시 처리
      try {
        processNamecard(file);
        markAsProcessed(file.getId());
      } catch (err) {
        Logger.log(`❌ 처리 실패: ${err.message}`);
      }
      return;
    }
  }
}
function debugFolder() {
  // 모든 Namecard_Images 폴더 출력
  const folders = DriveApp.getFoldersByName(CONFIG.FOLDER_NAME);
  while (folders.hasNext()) {
    const f = folders.next();
    console.log(`폴더: ${f.getName()} | ID: ${f.getId()}`);
    const files = f.getFiles();
    let cnt = 0;
    while (files.hasNext()) {
      const file = files.next();
      console.log(`  파일: ${file.getName()} | ID: ${file.getId()}`);
      cnt++;
    }
    console.log(`  → 총 ${cnt}개`);
  }
}
function moveFileToDone(file) {
  // Done 폴더 없으면 자동 생성
  let doneFolder;
  const folders = DriveApp.getFoldersByName(CONFIG.DONE_FOLDER);
  if (folders.hasNext()) {
    doneFolder = folders.next();
  } else {
    doneFolder = DriveApp.createFolder(CONFIG.DONE_FOLDER);
    console.log('📁 Done 폴더 생성: ' + CONFIG.DONE_FOLDER);
  }

  // 원본 폴더에서 제거 후 Done 폴더로 이동
  const originFolder = getDriveFolder(CONFIG.FOLDER_NAME);
  file.moveTo(doneFolder);
  console.log(`📦 이동 완료: ${file.getName()} → ${CONFIG.DONE_FOLDER}`);
}

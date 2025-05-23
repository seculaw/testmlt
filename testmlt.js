const express = require('express');
const puppeteer = require('puppeteer');
const os = require('os');

const app = express();
const port = 3006;

app.use(express.json());
app.use(express.static(__dirname, { index: 'testmlt.html' }));

async function scrapePrice(data) {
    const { sido, sigugun, eupmyeondong, bun1, bun2, dong, hosu, noDong } = data;
    let browser = null;
    let page = null;
    let apt_code = "";
    let dong_code = "";
    let ho_code = "";

    try {
        browser = await puppeteer.launch({
            headless: 'new',
            //headless: false,
            protocolTimeout: 60000,
        });
        page = await browser.newPage();
        await page.goto('https://www.realtyprice.kr/notice/town/searchPastYear.htm', { waitUntil: 'domcontentloaded' });

        // Step 1: 지번 검색 버튼 클릭
        await page.waitForSelector('img[alt="지번검색"]', { timeout: 30000 });
        await page.evaluate(() => {
            const element = document.querySelector('img[alt="지번검색"]');
            if (element) {
                element.click();
            } else {
                throw new Error("지번검색 이미지 버튼을 찾을 수 없습니다.");
            }
        });

        // Step 2: 시/도 선택
        await page.waitForSelector('#sido_list', { timeout: 30000 });
        const sidoSelectResult = await selectOption(page, '#sido_list', sido);
        if (!sidoSelectResult.success) {
            throw new Error(`시/도 선택 실패: ${sidoSelectResult.message}`);
        }
        await page.waitForSelector('#sgg_list option', { timeout: 30000 });

        // Step 3: 시/군/구 선택
        await page.waitForSelector('#sgg_list', { timeout: 30000 });
        const sigugunSelectResult = await selectOption(page, '#sgg_list', sigugun, false);
        if (!sigugunSelectResult.success) {
            throw new Error(`시/군/구 선택 실패: ${sigugunSelectResult.message}`);
        }
        await page.waitForSelector('#eub_list option', { timeout: 30000 });

        // Step 4: 읍/면/동 선택
        await page.waitForSelector('#eub_list', { timeout: 30000 });
        const eupmyeondongSelectResult = await selectOption(page, '#eub_list', eupmyeondong);
        if (!eupmyeondongSelectResult.success) {
            throw new Error(`읍/면/동 선택 실패: ${eupmyeondongSelectResult.message}`);
        }

        // Step 5: 지번 검색 라디오 버튼 선택
        await page.waitForSelector('input[name="rdoCondi"][value="1"]', { timeout: 30000 });
        await page.evaluate(() => {
            const element = document.querySelector('input[name="rdoCondi"][value="1"]');
            if (element) {
                element.click();
            } else {
                throw new Error("지번 검색 라디오 버튼을 찾을 수 없습니다.");
            }
        });

        // Step 6: 지번 입력
        await page.waitForSelector('input[name="bun1"][class="text2"]', { visible: true, timeout: 30000 });
        await page.evaluate(() => {
            const element = document.querySelector('input[name="bun1"][class="text2"]').select();
        });
        await page.keyboard.type(bun1);

        await page.waitForSelector('input[name="bun2"][class="text2"]', { visible: true, timeout: 30000 });
        await page.evaluate(() => {
            const element = document.querySelector('input[name="bun2"][class="text2"]').select();
        });
        await page.keyboard.type(bun2);

        // Step 7: 검색 버튼 클릭
        await page.waitForSelector('input[type="image"][class="btn-src1"]', { timeout: 30000 });
        await Promise.all([
            page.evaluate(() => {
                if (typeof searchAptName === 'function') {
                    searchAptName(1);
                } else {
                    throw new Error("searchAptName 함수를 찾을 수 없습니다.");
                }
            })
        ]);
        
        const newContentSelector = '#apt';
        await page.waitForSelector(newContentSelector, {
          visible: true,
            timeout: 5000
        });

        // Step 8: 단지명 리스트 처리 및 적절한 단지 선택
        await page.waitForSelector('#apt', { timeout: 30000 });
        
        // 모든 아파트 옵션 가져오기
        const aptOptions = await page.evaluate(() => {
            const options = Array.from(document.querySelectorAll('#apt option'));
            return options.map(option => ({
                value: option.value,
                text: option.textContent.trim()
            }));
        });

        if (aptOptions.length === 0) {
            throw new Error("아파트 단지 정보를 찾을 수 없습니다.");
        }

        // 각 아파트 단지별로 동 번호 확인
        let selectedAptValue = null;
        let selectedAptName = null;

        for (const aptOption of aptOptions) {
            // 아파트 단지 선택
            await page.select('#apt', aptOption.value);
            
            // 동 목록 로딩 대기
            await page.waitForSelector('#dong option', { timeout: 30000 });
            
            // 동 번호 목록 가져오기
            const dongNumbers = await page.evaluate(() => {
                const options = Array.from(document.querySelectorAll('#dong option'));
                return options.map(option => {
                    const text = option.textContent.trim();
                    return text.replace(/[^0-9]/g, ''); // 숫자만 추출
                }).filter(num => num !== ''); // 빈 문자열 제거
            });

            // 동번호없음이 체크된 경우, 첫 번째 아파트 단지를 선택
            if (noDong) {
                selectedAptValue = aptOptions[0].value;
                selectedAptName = aptOptions[0].text;
                break;
            }
            // 입력한 동 번호가 현재 아파트 단지의 동 번호 목록에 있는지 확인
            else if (dongNumbers.includes(dong)) {
                selectedAptValue = aptOption.value;
                selectedAptName = aptOption.text;
                break;
            }
        }

        if (!selectedAptValue) {
            throw new Error(`입력한 동 번호(${dong})를 포함하는 아파트 단지를 찾을 수 없습니다.`);
        }

        // 선택된 아파트 단지로 다시 선택
        await page.select('#apt', selectedAptValue);

        // Step 9: 동 선택
        await page.waitForSelector('#dong option', { timeout: 30000 });
        await page.waitForSelector('#dong', { timeout: 30000 });
        
        if (noDong) {
            // 동번호없음인 경우 첫 번째 동을 선택
            await page.evaluate(() => {
                const dongSelect = document.querySelector('#dong');
                if (dongSelect && dongSelect.options.length > 0) {
                    dongSelect.selectedIndex = 0;
                    const event = new Event('change', { bubbles: true });
                    dongSelect.dispatchEvent(event);
                }
            });
        } else {
            // 동번호가 있는 경우 입력한 동 번호로 선택
            const dongSelectResult = await selectOption(page, '#dong', dong, false);
            if (!dongSelectResult.success) {
                throw new Error(`아파트 동 선택 실패: ${dongSelectResult.message}`);
            }
        }

        // 호수 목록 가져오기
        let hoOptions = [];
        try {
            // 호수 옵션이 로드될 때까지 충분히 대기
            await page.waitForSelector('#ho option', { timeout: 60000 }); // 타임아웃 60초로 증가
            
            // 호수 옵션 가져오기 시도
            hoOptions = await page.evaluate(() => {
                const options = Array.from(document.querySelectorAll('#ho option'));
                return options.map(option => ({
                    value: option.value,
                    text: option.textContent.trim()
                }));
            });

            console.log('Available ho options:', hoOptions); // 디버깅을 위해 로그 추가

            if (hoOptions.length === 0) {
                throw new Error('호수 옵션을 찾을 수 없습니다.');
            }
        } catch (error) {
            console.error('호수 옵션 가져오기 실패:', error);
            throw new Error(`호수 옵션을 가져오는 중 오류가 발생했습니다: ${error.message}`);
        }

        // Step 10: 호 선택
        await page.waitForSelector('#ho', { timeout: 60000 }); // 타임아웃 60초로 증가
        
        // 호수 선택 시도
        const hoSelectResult = await page.evaluate((hosu) => {
            const hoSelect = document.querySelector('#ho');
            if (!hoSelect) return { success: false, message: '호수 선택 요소를 찾을 수 없습니다.' };

            // 호수 번호만 추출 (숫자만)
            const numericHosu = hosu.replace(/[^0-9]/g, '');
            
            // 모든 옵션을 순회하며 매칭되는 호수 찾기
            for (let i = 0; i < hoSelect.options.length; i++) {
                const optionText = hoSelect.options[i].textContent.trim();
                const optionNumeric = optionText.replace(/[^0-9]/g, '');
                
                if (optionNumeric === numericHosu) {
                    hoSelect.selectedIndex = i;
                    const event = new Event('change', { bubbles: true });
                    hoSelect.dispatchEvent(event);
                    return { success: true, message: `호수 ${optionText} 선택 성공` };
                }
            }
            
            return { success: false, message: `호수 ${hosu}를 찾을 수 없습니다.` };
        }, hosu);

        if (!hoSelectResult.success) {
            throw new Error(`아파트 호수 선택 실패: ${hoSelectResult.message}`);
        }
        console.log('열람하기 전 단계');
        // Step 11: 열람하기 버튼 클릭
        await page.waitForSelector('input[type="image"][class="btn-src3"]', { timeout: 30000 });
        await Promise.all([
            page.evaluate(() => {
                if (typeof goPage === 'function') {
                    goPage(1);
                } else {
                    throw new Error("goPage 함수를 찾을 수 없습니다.");
                }
            })
        ]);

        await page.waitForSelector('tbody#dataList tr:first-child span#opinNoticeAmt');

        const price = await page.evaluate(() => {
            const priceElement = document.querySelector('tbody#dataList tr:first-child span#opinNoticeAmt');
            if (priceElement) {
                const priceData = priceElement.innerText.trim().replace(/,/g, '');
                return priceData;
            } else {
                throw new Error("가격 정보를 찾을 수 없습니다.");
            }
        });

        const area = await page.evaluate(() => {
            const areaElement = document.querySelector('tbody#dataList tr:first-child td:nth-child(5)');
            if (areaElement) {
                return areaElement.textContent.trim();
            } else {
                return '';
            }
        });

        // 선택된 동과 호수 정보 가져오기
        const selectedDong = await page.evaluate(() => {
            const dongSelect = document.querySelector('#dong');
            return dongSelect ? dongSelect.options[dongSelect.selectedIndex].textContent.trim() : '';
        });

        const selectedHo = await page.evaluate(() => {
            const hoSelect = document.querySelector('#ho');
            return hoSelect ? hoSelect.options[hoSelect.selectedIndex].textContent.trim() : '';
        });

        // 호수 번호만 추출 (숫자만)
        const numericHo = selectedHo.replace(/[^0-9]/g, '');

        return { price, aptName: selectedAptName, area, dong: selectedDong, ho: numericHo };

    } catch (error) {
        console.error('Error during scraping:', error);
        return "Error";
    } finally {
        
         if (browser) {
             await browser.close();
         }
    }
}

// Levenshtein 거리 계산 함수 추가
function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j - 1] + 1, // 치환
                    dp[i - 1][j] + 1,     // 삭제
                    dp[i][j - 1] + 1      // 삽입
                );
            }
        }
    }
    return dp[m][n];
}

// 문자열 유사도 계산 함수
function calculateSimilarity(str1, str2) {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;
    const distance = levenshteinDistance(str1, str2);
    return 1 - distance / maxLength;
}

async function selectOption(page, selector, value, isSigugun = false) {
    try {
        const evaluationResult = await page.evaluate((selector, value, isSigugun) => {
            const select = document.querySelector(selector);
            if (!select) {
                return { success: false, message: `Selector ${selector} not found.`, selectedValue: null };
            }

            const normalizedValue = value.trim().toLowerCase();
            const options = Array.from(select.options);
            
            // 동 선택인 경우 특별 처리
            if (selector === '#dong') {
                // 숫자만 추출
                const numericValue = normalizedValue.replace(/[^0-9]/g, '');
                
                // 정확한 매칭 시도 (숫자만 비교)
                let exactMatchIndex = options.findIndex(option => {
                    const optionText = option.textContent.trim();
                    const optionNumeric = optionText.replace(/[^0-9]/g, '');
                    return optionNumeric === numericValue;
                });
                
                if (exactMatchIndex !== -1) {
                    select.selectedIndex = exactMatchIndex;
                    return { 
                        success: true, 
                        message: `Exact match found for dong number: ${options[exactMatchIndex].textContent.trim()}`, 
                        selectedValue: select.value 
                    };
                }

                // 부분 매칭 시도 (숫자 포함 여부 확인)
                let partialMatchIndex = options.findIndex(option => {
                    const optionText = option.textContent.trim();
                    const optionNumeric = optionText.replace(/[^0-9]/g, '');
                    return optionNumeric.includes(numericValue) || numericValue.includes(optionNumeric);
                });

                if (partialMatchIndex !== -1) {
                    select.selectedIndex = partialMatchIndex;
                    return { 
                        success: true, 
                        message: `Partial match found for dong number: ${options[partialMatchIndex].textContent.trim()}`, 
                        selectedValue: select.value 
                    };
                }
            }
            
            // 시/군/구 선택인 경우 특별 처리
            if (selector === '#sgg_list') {
                // 입력값을 단어로 분리
                const searchWords = normalizedValue.split(/\s+/).filter(word => word.length > 0);
                
                // 각 옵션에 대해 매칭 점수 계산
                const scoredOptions = options.map((option, index) => {
                    const optionText = option.textContent.trim().toLowerCase();
                    let score = 0;
                    let matchedWords = 0;
                    
                    // 각 검색어에 대해 점수 계산
                    searchWords.forEach(word => {
                        // '시', '구', '군' 등의 접미사 제거 후 비교
                        const cleanWord = word.replace(/[시군구]$/, '');
                        const cleanOptionText = optionText.replace(/[시군구]$/, '');
                        
                        if (cleanOptionText.includes(cleanWord)) {
                            score += 1;
                            matchedWords++;
                        }
                    });
                    
                    // 모든 검색어가 매칭된 경우 추가 점수
                    if (matchedWords === searchWords.length) {
                        score += 2;
                    }
                    
                    // 옵션 텍스트가 검색어를 포함하는 경우 추가 점수
                    if (optionText.includes(normalizedValue)) {
                        score += 1;
                    }
                    
                    // 검색어가 옵션 텍스트를 포함하는 경우 추가 점수
                    if (normalizedValue.includes(optionText)) {
                        score += 1;
                    }
                    
                    // 특수 케이스 처리 (예: '수원시 영통구' -> '수원영통구')
                    const cleanSearchText = normalizedValue.replace(/[시군구\s]/g, '');
                    const cleanOptionText = optionText.replace(/[시군구\s]/g, '');
                    
                    if (cleanOptionText.includes(cleanSearchText)) {
                        score += 2;
                    }
                    
                    return { index, score, text: optionText };
                });
                
                // 가장 높은 점수를 가진 옵션 찾기
                const bestMatch = scoredOptions.reduce((best, current) => {
                    return current.score > best.score ? current : best;
                }, { index: -1, score: -1, text: '' });
                
                if (bestMatch.score > 0) {
                    select.selectedIndex = bestMatch.index;
                    return { 
                        success: true, 
                        message: `Best match found for si/gun/gu: "${bestMatch.text}" (score: ${bestMatch.score})`, 
                        selectedValue: select.value 
                    };
                }
            }
            
            // 읍/면/동 선택인 경우 특별 처리
            if (selector === '#eub_list') {
                // 입력값을 단어로 분리
                const searchWords = normalizedValue.split(/\s+/).filter(word => word.length > 0);
                
                // 각 옵션에 대해 매칭 점수 계산
                const scoredOptions = options.map((option, index) => {
                    const optionText = option.textContent.trim().toLowerCase();
                    let score = 0;
                    let matchedWords = 0;
                    
                    // 각 검색어에 대해 점수 계산
                    searchWords.forEach(word => {
                        if (optionText.includes(word)) {
                            score += 1;
                            matchedWords++;
                        }
                    });
                    
                    // 모든 검색어가 매칭된 경우 추가 점수
                    if (matchedWords === searchWords.length) {
                        score += 2;
                    }
                    
                    // 옵션 텍스트가 검색어를 포함하는 경우 추가 점수
                    if (optionText.includes(normalizedValue)) {
                        score += 1;
                    }
                    
                    // 검색어가 옵션 텍스트를 포함하는 경우 추가 점수
                    if (normalizedValue.includes(optionText)) {
                        score += 1;
                    }
                    
                    return { index, score, text: optionText };
                });
                
                // 가장 높은 점수를 가진 옵션 찾기
                const bestMatch = scoredOptions.reduce((best, current) => {
                    return current.score > best.score ? current : best;
                }, { index: -1, score: -1, text: '' });
                
                if (bestMatch.score > 0) {
                    select.selectedIndex = bestMatch.index;
                    return { 
                        success: true, 
                        message: `Best match found for eup/myeon/dong: "${bestMatch.text}" (score: ${bestMatch.score})`, 
                        selectedValue: select.value 
                    };
                }
            }
            
            // 일반적인 경우의 정확한 매칭 시도
            let exactMatchIndex = options.findIndex(option => 
                option.textContent.trim().toLowerCase() === normalizedValue
            );
            if (exactMatchIndex !== -1) {
                select.selectedIndex = exactMatchIndex;
                return { success: true, message: 'Exact match found.', selectedValue: select.value };
            }

            // 일반적인 경우의 부분 매칭 시도
            let partialMatchIndex = options.findIndex(option => 
                option.textContent.trim().toLowerCase().includes(normalizedValue) ||
                normalizedValue.includes(option.textContent.trim().toLowerCase())
            );
            if (partialMatchIndex !== -1) {
                select.selectedIndex = partialMatchIndex;
                return { success: true, message: 'Partial match found.', selectedValue: select.value };
            }

            // 유사도 기반 매칭 시도
            let bestMatchIndex = -1;
            let bestSimilarity = 0.6; // 최소 유사도 임계값
            let bestMatchText = '';

            options.forEach((option, index) => {
                const optionText = option.textContent.trim();
                const similarity = calculateSimilarity(normalizedValue, optionText.toLowerCase());
                
                if (similarity > bestSimilarity) {
                    bestSimilarity = similarity;
                    bestMatchIndex = index;
                    bestMatchText = optionText;
                }
            });

            if (bestMatchIndex !== -1) {
                select.selectedIndex = bestMatchIndex;
                return { 
                    success: true, 
                    message: `Similar match found: "${bestMatchText}" (similarity: ${bestSimilarity.toFixed(2)})`, 
                    selectedValue: select.value 
                };
            }

            return { success: false, message: 'No matching option found.', selectedValue: null };
        }, selector, value, isSigugun);

        if (!evaluationResult.success) {
            throw new Error(evaluationResult.message);
        }

        // select 이벤트 발생
        await page.evaluate((selector) => {
            const select = document.querySelector(selector);
            if (select) {
                const event = new Event('change', { bubbles: true });
                select.dispatchEvent(event);
            }
        }, selector);

        return evaluationResult;
    } catch (error) {
        console.error('Error in selectOption:', error);
        return { success: false, message: error.message, selectedValue: null };
    }
}

async function scrapeBondRates() {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    const url = 'https://dbbond.co.kr/sub/_sale.php';

    try {
        // 페이지 로딩 및 초기 요소 로드 대기 시간 증가
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 }); // 네트워크 통신이 멈출 때까지 대기, 타임아웃 15초로 증가

        // 데이터가 포함된 테이블이 로딩될 때까지 기다림 (타임아웃 10초)
        await page.waitForSelector('div.sale-rate table tbody', { timeout: 15000 });

        // 데이터 추출
        const bondRateData = await page.evaluate(() => {
            const tableBody = document.querySelector('div.sale-rate table tbody');
            const rows = Array.from(tableBody.querySelectorAll('tr'));
            return rows.map(row => {
                const cells = row.querySelectorAll('td');
                const date = cells[0].innerText.trim();
                const rate = parseFloat(cells[1].innerText.trim());
                return { date, rate };
            });
        });
        return bondRateData;
    } catch (error) {
        console.error("Error scraping bond rates:", error);
        return null;
    } finally {
        await browser.close();
    }
}

app.post('/search', async (req, res) => {
    const data = req.body;
    try {
        const scrapingResult = await scrapePrice(data);

        if (scrapingResult === "Error" || !scrapingResult.price) {
            res.status(500).json({ message: "가격정보 가져오기 실패 (주소 재확인 필요) 예) 성남 -> 성남수정구" });
        } else {
            const { price: scrapedPrice, aptName, area, dong, ho } = scrapingResult;
            const bondRates = await scrapeBondRates();

            if (!bondRates || bondRates.length === 0) {
                res.status(500).json({ message: "채권 할인율 정보를 가져오는 데 실패했습니다. 해당날짜의 채권정보가 존재하지 않습니다." });
                return;
            }
            const todayBondRate = bondRates[0].rate;
            const standardPriceInt = parseInt(scrapedPrice.replace(/,/g, ''), 10);

            if (isNaN(standardPriceInt)) {
                res.status(500).json({ message: `스크래핑된 가격(${scrapedPrice})이 유효한 숫자가 아닙니다.` });
                return;
            }

            res.json({
                price: standardPriceInt,
                aptName: aptName,
                area: area,
                dong: dong,
                ho: ho,
                todayBondRate: todayBondRate
            });
        }
    } catch (error) {
        console.error('Error in /search endpoint:', error);
        res.status(500).json({ message: `서버 내부 오류: ${error.message}` });
    }
});

app.listen(port, () => {
    const interfaces = os.networkInterfaces();
    let ipAddress = 'localhost';

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ipAddress = iface.address;
                break;
            }
        }
        if (ipAddress !== 'localhost') break;
    }

    console.log(`Server listening on http://${ipAddress}:${port}`);
});

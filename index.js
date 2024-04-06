const fs = require('fs');
const cron = require('node-cron');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { Octokit } = require("@octokit/rest");
require('dotenv').config();

const { langCodes } = require('./data/langCodes.js');
const cooldown = 1 * 1000;

const casesHref = ['https://key-drop.com/pl/skins/category/zony', 'https://key-drop.com/pl/skins/category/forever','https://key-drop.com/pl/skins/category/nexe', 'https://key-drop.com/pl/skins/category/dmg', 'https://key-drop.com/pl/skins/category/innocent', 'https://key-drop.com/pl/skins/category/medusa', 'https://key-drop.com/pl/skins/category/isamu', 'https://key-drop.com/pl/skins/category/mateo', 'https://key-drop.com/pl/skins/category/kacper-rietz', 'https://key-drop.com/pl/skins/category/mopo', 'https://key-drop.com/pl/skins/category/xm1nn', 'https://key-drop.com/pl/skins/category/rennow', 'https://key-drop.com/pl/skins/category/enerqia'];

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    underscore: '\x1b[4m',
    blink: '\x1b[5m',
    reverse: '\x1b[7m',
    hidden: '\x1b[8m',
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

const WaterMark = () => {
    console.log(colors.cyan +
` _  __          ____                           ____                       ___      _     _     
| |/ /___ _   _|  _ \\ _ __ ___  _ __    _     / ___|__ _ ___  ___  ___   / _ \\  __| | __| |___ 
| ' // _ \\ | | | | | | '__/ _ \\| '_ \\ _| |_  | |   / _\` / __|/ _ \\/ __| | | | |/ _\` |/ _\` / __|
| . \\  __/ |_| | |_| | | | (_) | |_) |_   _| | |__| (_| \\__ \\  __/\\__ \\ | |_| | (_| | (_| \\__ \\
|_|\\_\\___|\\__, |____/|_|  \\___/| .__/  |_|    \\____\\__,_|___/\\___||___/  \\___/ \\__,_|\\__,_|___/
            |___/                |_|`);
    console.log(`\nKeydrop+ Cases Odds is a service that gets case odds from Keydrop. You can find the source code on GitHub: https://github.com/Juzlus/KeydropPlusCasesOdds`);
    console.log(`If you have any Feedback or questions, please contact me at juzlus.biznes@gmail.com or Discord: juzlus.${colors.reset}`);
};

const CreateChrome = async() => {
    console.log(`\n${colors.bright}${colors.black}[${new Date().toLocaleString()}]${colors.reset}${colors.reset} ${colors.bright}Starting Keydrop Cases Odds${colors.reset}`);
    await puppeteer.use(StealthPlugin())
    const browser = await puppeteer.launch({ headless: true, options: {'args': ['--no-sandbox']}, executablePath: process.env.BROWSER_PATH });
    const page = await browser.newPage();

    const eventCase = await FetchCaseList(page, true);
    ConvertEventCase(eventCase);
    for (i = 0; i < langCodes.length; i++) 
    {
        await ChangeCountry(page, langCodes[i]);
        const response = await FetchCaseList(page);
        ConvertCaseList(response);
        await new Promise(resolve => setTimeout(resolve, cooldown));
    }

    const cases = [];
    for (i = 0; i < casesHref.length; i++) 
    {
        const caseInfo = await GetOdds(page, i);
        cases.push(caseInfo);
        await new Promise(resolve => setTimeout(resolve, cooldown));
    }

    await browser.close();
    fs.writeFileSync('./cases.json', JSON.stringify(cases, null, 4), 'utf-8');
    console.log(`${colors.bright}${colors.black}[${new Date().toLocaleString()}]${colors.reset}${colors.reset} ${colors.green}DONE! New ${colors.magenta}cases.json${colors.reset}${colors.green} file created!${colors.reset}`)
    
    if(process.env.GITHUB_TOKEN)
        updateFileOnGitHub(cases);
};

const updateFileOnGitHub = async(cases) => {
    const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN
    });

    const githubData = {
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
        path: process.env.GITHUB_FILE,
        branch: process.env.GITHUB_BRANCH,
    };

    octokit.repos.getContent(githubData).then(response => {
        const sha = response.data.sha;
        octokit.repos.createOrUpdateFileContents({
            owner: process.env.GITHUB_OWNER,
            repo: process.env.GITHUB_REPO,
            path: process.env.GITHUB_FILE,
            message: 'Case odds updated',
            branch: process.env.GITHUB_BRANCH,
            content: Buffer.from(JSON.stringify(cases, null, 4)).toString('base64'),
            sha: sha,
        }).then(result => {
            console.log(`${colors.bright}${colors.black}[${new Date().toLocaleString()}]${colors.reset}${colors.reset} ${colors.green}File updated on Github successfully!${colors.reset}`)
        }).catch(error => {
            console.error(`${colors.red}Error updating file on Github:${colors.reset}`, error);
        });
    }).catch(error => {
        console.error(`${colors.red}Error retrieving file content:${colors.reset}`, error);
    });
};

const ConvertEventCase = (caseList) => {
    const json = JSON.parse(caseList);
    if (json['status'] == false) return;

    json['mainEvent']['cases'].forEach(caseEl => {
        casesHref.push(caseEl['url']);
    });

    json['subEvent']['cases'].forEach(caseEl => {
        casesHref.push(caseEl['url']);
    });
};

const ConvertCaseList = (caseList) => {
    const json = JSON.parse(caseList);
    if (json['success'] == false) return;

    json['sections'].forEach(sectionEl => {
        sectionEl['cases'].forEach(caseEl => {
            if (!casesHref.includes(caseEl['url']))
                casesHref.push(caseEl['url']);
        });
    });
};

const FetchCaseList = async(page, isEvent = false) => {
    await page.goto(isEvent ? 'https://key-drop.com/en/Event/Event/globalEvents' : 'https://key-drop.com/en/apiData/Cases');
    try {
        await page.waitForSelector('pre');
        console.log(`${colors.bright}${colors.black}[${new Date().toLocaleString()}]${colors.reset}${colors.reset} ${colors.bright}Fetching ${isEvent ? 'event ' : ''}case list...${colors.reset}`)
        return await page.evaluate(() => {
            const el = document.querySelector('pre');
            return el?.innerHTML || null;
        });
    }
    catch(err) { console.error(err); };

};

const ChangeCountry = async(page, langCode) => {
    try {
        console.log(`${colors.bright}${colors.black}[${new Date().toLocaleString()}]${colors.reset}${colors.reset} ${colors.bright}User country code set to ${colors.magenta}${langCode}${colors.reset}`)
        await page.setCookie({
            name: 'currency',
            value: 'USD',
            domain: 'key-drop.com',
            path: '/',
        });
        await page.setCookie({
            name: 'userCountryCode',
            value: langCode,
            domain: 'key-drop.com',
            path: '/',
        });
        return 1;
    } catch (err) { console.error(err); };
};

const GetOdds = async(page, index) => {
    await page.goto(casesHref[index]);
    try {
        await page.waitForSelector('#header-root');
        console.log(`${colors.bright}${colors.black}[${new Date().toLocaleString()}]${colors.reset}${colors.reset} ${colors.bright}Loading case odds... ${colors.green}${index + 1}${colors.reset} ${colors.bright}/ ${colors.magenta}${casesHref?.length}${colors.reset}`)
        return await page.evaluate(() => {
            const caseData = window.__case;
            if(!caseData) return;

            const caseEl = {
                name: caseData?.title,
            }

            let betterSkinsOdds = 0;
            if(caseData?.priceFrom == 'gold') {
                let gold = 35000000000;
                let pfs = [];
                caseData?.items?.forEach(el => {
                    pfs.push(...el?.pf);
                });
                
                const goldProfit = pfs.reduce((totalProfit, pf) => {
                    while (gold > caseData?.price) {
                        gold -= caseData?.price;
                        const roll = Math.floor(Math.random() * 100000) + 1;
                        const drop = pfs.filter(item => roll >= item?.intervalFrom && roll <= item?.intervalTo);
                        totalProfit += parseFloat(drop[0]?.price);
                    }
                    return totalProfit;
                }, 0);
                caseEl.goldProfit = goldProfit?.toFixed(2)
            }
            else {
                caseData?.items?.forEach(el => {
                    if(el?.pf?.length)
                        el?.pf?.forEach(el2 => {
                            if(el2?.price > caseData?.price)
                                betterSkinsOdds += el2?.odds;
                        });
                    else
                        if(parseFloat(el?.price) > caseData?.price)
                            betterSkinsOdds += el?.pfPercent;
                });

                if (caseData?.layoutVariant?.id == 'YOUTUBER') {
                    caseEl.img = caseData?.coverImg,
                    caseEl.url = caseData?.depositUrl,
                    caseEl.price_USD = caseData?.price,
                    caseEl.youtuber = true
                }
                caseEl.odds = Math?.round(betterSkinsOdds);
            }

            return caseEl;
        });
    }
    catch(err) { console.error(err); };
}

WaterMark();
cron.schedule('0 14 * * *', () => {
    CreateChrome();
});
CreateChrome();
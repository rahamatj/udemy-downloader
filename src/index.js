#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

let config = {};
try {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch (e) {}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

const cookieString = () => `access_token=${config.COOKIE}`;

async function getLectureData (courseId, lectureId) {
    const url = `https://www.udemy.com/api-2.0/users/me/subscribed-courses/${courseId}/lectures/${lectureId}/?fields[lecture]=asset,description,download_url,is_free,last_watched_second&fields[asset]=asset_type,length,media_license_token,course_is_drmed,media_sources,captions,thumbnail_sprite,slides,slide_urls,download_urls,external_url&q=0.2678565073601946`;

    const headers = {
        'Cookie': cookieString()
    };

    try {
        const response = await axios.get(url, { headers });
        return response.data;
    } catch (error) {
        throw error
    }
};

async function getAllCourse(courseId) {
    try {
        const headers = {
            'Cookie': cookieString()
        };
        let url = `https://www.udemy.com/api-2.0/course-landing-components/${courseId}/me/?components=curriculum_context`
        const response = await axios.get(url, { headers });

        return response.data;
    } catch (error) {
        throw error
    }
}

async function ensureFileExists(filePath) {
    return fs.existsSync(filePath);
}

async function downloadSubtitle(subtitleUrl, subtitlePath) {
    if (await ensureFileExists(subtitlePath)) return
    const writer = fs.createWriteStream(subtitlePath);

    try {
        const response = await axios.get(subtitleUrl, {
            responseType: 'stream',
        });

        response.data.pipe(writer);

        return await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (err) {
        throw err;
    }
}

function isVideoSource(source = {}) {
    const type = String(source.type || source.mime || '').toLowerCase();
    const src = String(source.src || source.file || source.url || '').toLowerCase();

    const hasVideoMime = /video\//.test(type) || /application\/(x-mpegurl|vnd\.apple\.mpegurl)/.test(type);
    const hasVideoExtension = /\.(mp4|m4v|webm|mov|m3u8)(\?.*)?$/i.test(src) || /\/(mp4|m4v|webm|mov|m3u8)(\?.*)?$/i.test(src);

    return hasVideoMime || hasVideoExtension;
}

function collectVideoSources(asset = {}) {
    const listRawUrl = [];

    (asset.media_sources || []).forEach((source) => {
        if (!source) return;
        const src = source.src || source.file || source.url;
        if (!src || !isVideoSource(source)) return;

        listRawUrl.push({
            label: source.label || source.quality || source.resolution || source.height || 'unknown',
            src
        });
    });

    Object.values(asset.download_urls || {}).forEach((items = []) => {
        if (!Array.isArray(items)) return;

        items.forEach((item) => {
            if (!item) return;
            const src = item.file || item.url || item.src;
            if (!src || !isVideoSource(item)) return;

            listRawUrl.push({
                label: item.label || item.quality || item.resolution || item.height || 'unknown',
                src
            });
        });
    });

    return listRawUrl.filter((source, index, arr) => arr.findIndex(item => item.src === source.src) === index);
}

async function downloadCourse(data, filePath, quality = '480P') {
    if (await ensureFileExists(filePath)) return
    if (!data) {
        console.log('Error: Unable to download course data');
        return;
    }
    let listRawUrl = []

    if (data.asset.asset_type.toLowerCase() !== 'video') {
        console.log(`Course ${data.id} is not a video`);
        return
    }

    listRawUrl = collectVideoSources(data.asset)

    if (listRawUrl.length === 0) {
        console.log(`No video found for course ${data.id}`);
        return
    }

    const qualitys = []
    listRawUrl.forEach(item => {
        if (!qualitys.includes(item.label)) qualitys.push(item.label)
    })

    let url = listRawUrl.filter((source) => source.label === quality)[0]

    if (!url) {
        url = listRawUrl[0]
        console.log(`No quality ${quality}P found in course. Downloading ${url.label}P...`);
    }
    url = url.src

    const writer = fs.createWriteStream(filePath);

    try {
        const response = await axios.get(url, {
            responseType: 'stream',
        });

        response.data.pipe(writer);

        return await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (err) {
        throw err
    }
}

function sanitizeTitle(title) {
    return title
        .replace(/[\/\\:*?"<>|]/g, '_') // Ganti karakter yang tidak valid dengan underscore
        .trim(); // Hapus spasi di awal dan akhir
}

async function processCourses(index, courseId, groupList, coursePath) {
    let [group, curri] = index.split('-')
    group = parseInt(group) - 1
    curri = parseInt(curri) || 0

    // Mendapatkan grup dari listCourse berdasarkan indeks grup
    const groupKeys = Object.keys(groupList);
    if (group < 0 || group >= groupKeys.length) {
        console.log(`Index grup ${group} tidak tersedia.`);
        return;
    }

    let groupKey = groupKeys[group]
    const sections = groupList[groupKey];

    // Membuat folder untuk grup
    const groupFolderName = `${group + 1}_${sanitizeTitle(groupKey).replace(/ /g, '_')}`;
    const groupPath = path.join(process.cwd(), coursePath, groupFolderName);
    if (!fs.existsSync(groupPath)) {
        fs.mkdirSync(groupPath, { recursive: true });
        console.log(`Folder ${groupKey} berhasil dibuat.`);
    }
    
    const gdata = await getLectureData(courseId, curri !== 0 ? sections[curri - 1].id : sections[0].id);
    let listRawUrl = []

    if (gdata.asset.asset_type.toLowerCase() !== 'video') {
        console.log(`Course ${gdata.id} is not a video`);
        return
    }

    listRawUrl = collectVideoSources(gdata.asset)
    if (listRawUrl.length === 0) {
        console.log(`No video found for course ${gdata.id}`);
        return
    }

    const qualitys = []
    listRawUrl.forEach(item => {
        if (!qualitys.includes(item.label)) qualitys.push(item.label)
    })

    // Pick the highest available quality label automatically
    const quality = qualitys.slice().sort((a, b) => parseInt(b) - parseInt(a))[0]

    if (curri === 0) {
        console.log('Starting Batch Download...')
        // Proses semua section dalam grup
        for (let i = 0; i < sections.length; i++) {
            const data = await getLectureData(courseId, sections[i].id);
            if (data.asset.asset_type.toLowerCase() !== 'video') {
                console.log(`Course ${gdata.id} is not a video`);
                continue
            }
            
            const filePathName = `${i + 1}_${sanitizeTitle(sections[i].title)}`
            const filePath = path.join(groupPath, `${filePathName}.mp4`);
            if (fs.existsSync(filePath)) continue

            await downloadCourse(data, filePath, quality);
            console.log(`\n${sections[i].title} Successfully Downloaded.`);
        }
    } else if (Number.isInteger(curri)) {
        if (gdata.asset.asset_type.toLowerCase() !== 'video') {
            console.log(`Course ${gdata.id} is not a video`);
            return
        }
        curri = curri - 1
        // Proses section berdasarkan index
        if (curri >= 0 && curri < sections.length) {
            const sec = sections[curri];
            const filePathName = `${curri + 1}_${sanitizeTitle(sec.title)}`
            const filePath = path.join(groupPath, `${filePathName}.mp4`);
            if (fs.existsSync(filePath)) return

            console.log('\nDownloading Video...');
            await downloadCourse(gdata, filePath, quality);
            console.log(`\n${sec.title} Successfully Downloaded.`);
        } else {
            console.log(`Index section ${curri} not found in ${groupKey}`);
        }
    } else {
        console.log(`Format index tidak valid.`);
    }
}

async function getUserCourse() {
    try {
        const response = await axios.get('https://www.udemy.com/api-2.0/users/me/subscribed-courses/?is_archived=false', {
            headers: {
                'Cookie': cookieString()
            }
        });

        const listCourse = response.data.results.map((course) => {
            return {
                title: course.title,
                clean_title: course.published_title,
                id: course.id,
                cover: course.image_480x270,
            }
        })
        return listCourse
    } catch (error) {
        throw error
    }
}


module.exports = {
    collectVideoSources,
    isVideoSource,
    sanitizeTitle,
    downloadCourse,
    downloadSubtitle,
    getLectureData,
    getAllCourse,
    getUserCourse,
    processCourses,
    main,
};

if (require.main === module) {
    main();
}

async function main() {
    try {
        if (!config.COOKIE) {
            let newCookie = await question('\nUsing right click if you can paste.\nEnter your cookie (access_token): ');
            newCookie.replace('"', '')
            config.COOKIE = newCookie;
            fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 4));
            console.log('Cookie saved!');
        }

        let ask = await question('\n1. Download Courses\n2. Replace Cookie\n3. exit\n\nSelect option: ');
        if (ask === '2') {
            let newCookie = await question('Enter your cookie (access_token): ');
            newCookie.replace('"', '')
            config.COOKIE = newCookie;
            fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 4));
            console.log('Cookie saved!');
        } else if (ask === '3') {
            process.exit()
        }
        
        let caption;
        const listUserCourse = await getUserCourse()
        caption = listUserCourse.map((course, idx) => `${idx + 1}. ${course.title} (${course.id})`).join('\n')
        const id = await question(`\n[ List Subcribed Course ]\n\n${caption}\n\nSelect course above (e.g., 1): `)

        const course = listUserCourse[id - 1]
        if (!course) {
            console.log('Course not found');
            return
        }

        //const courseId = '473160'
        let data = await getAllCourse(course.id)

        let listCourse = {}

        await data.curriculum_context.data.sections.forEach(section => {
            let title = section.title
            let listLecture = section.items.map(lecture => {
                return {
                    title: lecture.title,
                    id: lecture.id
                }
            })

            listCourse[title] = listLecture
        });

        caption = Object.keys(listCourse).map((key, idxs) => {
            let cap = `\n\n[ ${idxs + 1}. ${key} ]\n`;
            cap += `${idxs + 1}-0. All this section\n`;
            cap += listCourse[key].map((lecture, idx) => {
                return `${idxs + 1}-${idx + 1}. ${lecture.title} (${lecture.id})`;
            }).join('\n');
            return cap;
        }).join('');

        let index = await question(`${caption}\n\n0. Download all sections\n\nSelect lecture above (e.g., 1-1): `)

        if (index === '0') {
            const groupKeys = Object.keys(listCourse);
            for (let i = 0; i < groupKeys.length; i++) {
                await processCourses(`${i + 1}-0`, course.id, listCourse, course.clean_title)
            }
            return;
        }

        const regex = /^(\d+-\d+)$/;

        if (!regex.test(index)) {
            console.log('Index not valid.');
            return;
        }

        await processCourses(index, course.id, listCourse, course.clean_title)
    } catch (error) {
        console.error(error);
    } finally {
        if (require.main === module) {
            main()
        }
    }
}
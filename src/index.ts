import 'cheerio';

import * as URL from './urls';
import { CourseInfo, SemesterInfo, Notification, File, Homework } from './types';
import { INotification, INotificationDetail } from './types';
import { IHomework, IHomeworkDetail } from './types';
import { parseSemesterType, decodeHTMLEntities } from './utils';

const FETCH_COMMON_CONFIG: RequestInit = {
    credentials: 'include',
};

const myFetch = (url: string, config: RequestInit = {}) => {
    return fetch(url, {...FETCH_COMMON_CONFIG, ...config});
};

export class Learn2018Helper {

    private readonly username: string = "";
    private readonly password: string = "";
    private hasLogin: boolean = false;

    constructor(username: string, password: string) {
        this.username = username;
        this.password = password;
    }

    public async login(): Promise<boolean> {

        const ticketResponse = await myFetch(URL.ID_LOGIN(), {
            body: URL.ID_LOGIN_FORM_DATA(this.username, this.password),
            method: 'POST',
        });
        if (!ticketResponse.ok) {
            return false;
        }
        const body = cheerio.load(await ticketResponse.text());
        const targetURL = body('a').attr('href');
        const ticket = targetURL.split('=').slice(-1)[0];

        const loginResponse = await myFetch(URL.LEARN_AUTH_ROAM(ticket));
        return (this.hasLogin = loginResponse.ok);

    }

    public async getCurrentSemester(): Promise<SemesterInfo> {

        this.ensureLogin();
        const response = await myFetch(URL.LEARN_CURRENT_SEMESTER());
        const result = (await response.json()).result;
        return {
            id: result.id,
            startDate: new Date(result.kssj),
            endDate: new Date(result.jssj),
            startYear: Number(result.xnxq.slice(0, 4)),
            endYear: Number(result.xnxq.slice(5, 9)),
            type: parseSemesterType(Number(result.xnxq.slice(10, 11)))
        }

    }

    public async getCourseForSemester(semesterID: string): Promise<CourseInfo[]> {

        this.ensureLogin();
        const response = await myFetch(URL.LEARN_COURSE_LIST(semesterID));
        const result = (await response.json()).resultList as any[];
        const courses: CourseInfo[] = [];

        await Promise.all(result.map(async (c) => {
            courses.push({
                _id: c.wlkcid,
                name: c.kcm,
                teacherName: c.jsm,
                courseNumber: c.kch,
                courseIndex: c.kxh,
            });
        }));

        return courses;

    }

    public async getNotificationList(courseID: string): Promise<Notification[]> {

        this.ensureLogin();
        const response = await myFetch(URL.LEARN_NOTIFICATION_LIST(courseID));
        const result = (await response.json()).object.aaData as any[];
        const notifications: Notification[] = [];

        await Promise.all(result.map(async (n) => {
            const notification: INotification = {
                _id: n.ggid,
                content: decodeHTMLEntities(n.ggnrStr),
                title: n.bt,
                publisher: n.fbrxm,
                hasRead: n.sfyd === '是',
                markedImportant: n.sfqd === '1',
                publishTime: new Date(n.fbsjStr),
            };
            let detail: INotificationDetail = {};
            if (n.fjmc !== null) {
                notification.attachmentName = n.fjmc;
                detail = await this.parseNotificationDetail(courseID, notification._id);
            }
            notifications.push({...notification, ...detail});
        }));

        return notifications;

    }

    public async getFileList(courseID: string): Promise<File[]> {

        this.ensureLogin();
        const response = await myFetch(URL.LEARN_FILE_LIST(courseID));
        const result = (await response.json()).object as any[];
        const files: File[] = [];

        await Promise.all(result.map(async (f) => {
            files.push({
                _id: f.wjid,
                title: f.bt,
                description: f.ms,
                size: f.fileSize,
                uploadTime: new Date(f.scsj),
                downloadUrl: URL.LEARN_FILE_DOWNLOAD(f.wjid),
                isNew: f.isNew,
                markedImportant: f.sfqd === '1',
                visitCount: f.llcs,
                downloadCount: f.xzcs,
                fileType: f.wjlx,
            });
        }));

        return files;

    }

    private ensureLogin() {
        if (!this.hasLogin) {
            throw new Error('Not logged in.');
        }
    }

    private async parseNotificationDetail(courseID: string, id: string): Promise<INotificationDetail>{
        const response = await myFetch(URL.LEARN_NOTIFICATION_DETAIL(courseID, id));
        const result = cheerio.load(await response.text());
        return { attachmentUrl: result('.ml-10').attr('href') };
    }
}

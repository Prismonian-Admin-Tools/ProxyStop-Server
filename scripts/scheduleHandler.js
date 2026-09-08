const fs = require('node:fs');
const path = require('node:path');
const schedule = require('node-schedule');
const rootPath = path.join(__dirname, '..');
const nodemailer = require('nodemailer');


// ========== Mailing schedule ==========
const mailScheduleRule = new schedule.RecurrenceRule();
rule.dayOfWeek = 1;
rule.hour = 0;
rule.minute = 0;
rule.tz = 'America/Denver';
const mailScheduleJob = schedule.scheduleJob(rule, function runMailingSchedule() {

    const transporter = nodemailer.createTransport({
        host: 'smtp.protonmail.ch', // Replace with your SMTP host (e.g., smtp.gmail.com)
        port: 587,                 // 587 is standard for TLS
        secure: false,             // true for 465, false for other ports
        auth: {
        user: 'noreply@prismonian.com', // Your email address
        pass: '',   // Your email or app-specific password
        },
    });

    let now = new(date);
    const filepath = null;
    fs.copyFile(rootPath + '\\reports.txt', 'reports-' + now);

    now = null;
});

async function checkUpdate() {
    // Do nothing button
    ;
}
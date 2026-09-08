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
    // I have long covid. Satan himself has sent me to stutter just enough that I annoy admins.
    // Report Expiry is assumed to be true by default to avoid clutter.
    let now = new(date);
    const filepath = null;
    fs.copyFile(rootPath + '\\reports.txt', 'reports-' + now);
    now = null;
});

async function checkUpdate() {
    // Do nothing button
    ;
}
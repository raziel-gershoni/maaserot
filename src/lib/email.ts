/**
 * Email sending utilities for authentication
 * Uses Resend for email delivery
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@maaserot.app';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send email using Resend API
 */
async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not configured. Email sending disabled.');
    console.log(`[DEV MODE] Would send email to ${to}: ${subject}`);
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Email sending failed:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
}

/**
 * Send email verification link
 */
export async function sendVerificationEmail(email: string, token: string, locale: string = 'he'): Promise<boolean> {
  const verificationUrl = `${APP_URL}/${locale}/verify/${token}`;

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>אימות כתובת אימייל</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f4f4f4; border-radius: 5px; padding: 20px;">
    <h1 style="color: #4f46e5; text-align: center;">ברוכים הבאים למעשרות</h1>
    <p style="font-size: 16px;">שלום,</p>
    <p style="font-size: 16px;">תודה שנרשמת למערכת מעשרות. כדי להשלים את ההרשמה, נא לאמת את כתובת האימייל שלך.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationUrl}" style="background-color: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">אמת את האימייל שלי</a>
    </div>
    <p style="font-size: 14px; color: #666;">אם הכפתור לא עובד, העתק והדבק את הקישור הבא בדפדפן:</p>
    <p style="font-size: 14px; word-break: break-all; background-color: #fff; padding: 10px; border-radius: 3px;">${verificationUrl}</p>
    <p style="font-size: 14px; color: #666; margin-top: 20px;">הקישור תקף ל-24 שעות.</p>
    <p style="font-size: 14px; color: #666;">אם לא ביקשת להירשם, אפשר להתעלם מהמייל הזה.</p>
  </div>
</body>
</html>
  `;

  return sendEmail({
    to: email,
    subject: 'אימות כתובת אימייל - מעשרות',
    html,
  });
}

/**
 * Send password reset email (future implementation)
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const resetUrl = `${APP_URL}/he/reset-password/${token}`;

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>איפוס סיסמה</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f4f4f4; border-radius: 5px; padding: 20px;">
    <h1 style="color: #4f46e5; text-align: center;">איפוס סיסמה</h1>
    <p style="font-size: 16px;">שלום,</p>
    <p style="font-size: 16px;">קיבלנו בקשה לאיפוס הסיסמה שלך. לחץ על הכפתור למטה כדי ליצור סיסמה חדשה.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="background-color: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">אפס את הסיסמה</a>
    </div>
    <p style="font-size: 14px; color: #666;">אם הכפתור לא עובד, העתק והדבק את הקישור הבא בדפדפן:</p>
    <p style="font-size: 14px; word-break: break-all; background-color: #fff; padding: 10px; border-radius: 3px;">${resetUrl}</p>
    <p style="font-size: 14px; color: #666; margin-top: 20px;">הקישור תקף ל-1 שעה.</p>
    <p style="font-size: 14px; color: #666;">אם לא ביקשת איפוס סיסמה, אפשר להתעלם מהמייל הזה.</p>
  </div>
</body>
</html>
  `;

  return sendEmail({
    to: email,
    subject: 'איפוס סיסמה - מעשרות',
    html,
  });
}

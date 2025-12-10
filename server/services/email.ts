// Email service using SendGrid integration - referenced from blueprint:javascript_sendgrid
import sgMail from '@sendgrid/mail';
import { randomInt } from 'crypto';

// Initialize SendGrid with API key
if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY environment variable not set - email functionality will be disabled");
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.error('SendGrid API key not configured - cannot send email');
    return false;
  }

  try {
    await sgMail.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    console.log(`Email sent successfully to ${params.to}`);
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

export function generateSecurePassword(length: number = 12): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  
  const allChars = uppercase + lowercase + numbers + symbols;
  
  let password = '';
  
  // Ensure at least one character from each category using cryptographically secure random
  password += uppercase[randomInt(0, uppercase.length)];
  password += lowercase[randomInt(0, lowercase.length)];
  password += numbers[randomInt(0, numbers.length)];
  password += symbols[randomInt(0, symbols.length)];
  
  // Fill the rest with cryptographically secure random characters
  for (let i = 4; i < length; i++) {
    password += allChars[randomInt(0, allChars.length)];
  }
  
  // Shuffle the password using Fisher-Yates algorithm with cryptographically secure random
  const passwordArray = password.split('');
  for (let i = passwordArray.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
  }
  
  return passwordArray.join('');
}

export function createWelcomeEmailTemplate(
  firstName: string,
  lastName: string,
  username: string,
  tempPassword: string,
  organizationName: string
): { subject: string; html: string; text: string } {
  const subject = `Welcome to ${organizationName} - Your Account Details`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">
        Welcome to ${organizationName}
      </h2>
      
      <p>Hello ${firstName} ${lastName},</p>
      
      <p>Your account has been created successfully! Here are your login credentials:</p>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #333;">Login Details</h3>
        <p><strong>Username:</strong> ${username}</p>
        <p><strong>Temporary Password:</strong> <code style="background-color: #e9ecef; padding: 4px 8px; border-radius: 4px;">${tempPassword}</code></p>
      </div>
      
      <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h4 style="margin-top: 0; color: #856404;">⚠️ Important Security Notice</h4>
        <p style="margin-bottom: 0; color: #856404;">
          For security reasons, you will be required to change this password when you first log in. 
          Please choose a strong, unique password that you haven't used elsewhere.
        </p>
      </div>
      
      <p>To access your account:</p>
      <ol>
        <li>Visit the IT Asset Management portal</li>
        <li>Enter your username and temporary password</li>
        <li>Follow the prompts to set your new password</li>
      </ol>
      
      <p>If you have any questions or need assistance, please contact your system administrator.</p>
      
      <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
      <p style="font-size: 12px; color: #666;">
        This email was sent automatically by the ${organizationName} IT Asset Management system. 
        Please do not reply to this email.
      </p>
    </div>
  `;
  
  const text = `
Welcome to ${organizationName}

Hello ${firstName} ${lastName},

Your account has been created successfully! Here are your login credentials:

Username: ${username}
Temporary Password: ${tempPassword}

IMPORTANT SECURITY NOTICE:
For security reasons, you will be required to change this password when you first log in. 
Please choose a strong, unique password that you haven't used elsewhere.

To access your account:
1. Visit the IT Asset Management portal
2. Enter your username and temporary password
3. Follow the prompts to set your new password

If you have any questions or need assistance, please contact your system administrator.

---
This email was sent automatically by the ${organizationName} IT Asset Management system. 
Please do not reply to this email.
  `;
  
  return { subject, html, text };
}

export function createAccessReviewReminderTemplate(
  reviewerName: string,
  campaignName: string,
  pendingCount: number,
  dueDate: Date,
  daysRemaining: number,
  reviewItems: Array<{ userName: string; appName: string; riskLevel: string }>,
  organizationName: string
): { subject: string; html: string; text: string } {
  const dueDateStr = dueDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const urgencyLevel = daysRemaining <= 1 ? 'urgent' : daysRemaining <= 3 ? 'high' : 'medium';
  const urgencyColor = urgencyLevel === 'urgent' ? '#dc2626' : urgencyLevel === 'high' ? '#f59e0b' : '#3b82f6';

  const subject = daysRemaining <= 1
    ? `URGENT: ${pendingCount} Access Reviews Due ${daysRemaining === 0 ? 'Today' : 'Tomorrow'}`
    : `Reminder: ${pendingCount} Access Reviews Due in ${daysRemaining} Days`;

  const topItems = reviewItems.slice(0, 5);
  const hasMore = reviewItems.length > 5;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333; border-bottom: 2px solid #4f46e5; padding-bottom: 10px;">
        Access Review Reminder
      </h2>

      <p>Hello ${reviewerName},</p>

      <p>You have <strong>${pendingCount}</strong> pending access review${pendingCount > 1 ? 's' : ''} that require your attention.</p>

      <div style="background-color: ${urgencyColor}20; border-left: 4px solid ${urgencyColor}; padding: 15px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: ${urgencyColor};">
          ${urgencyLevel === 'urgent' ? '⚠️ URGENT' : urgencyLevel === 'high' ? '⏰ HIGH PRIORITY' : 'ℹ️ REMINDER'}
        </h3>
        <p style="margin-bottom: 0;">
          <strong>Campaign:</strong> ${campaignName}<br>
          <strong>Due Date:</strong> ${dueDateStr}<br>
          <strong>Time Remaining:</strong> ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}
        </p>
      </div>

      <h3 style="color: #333;">Pending Reviews</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">User</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Application</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Risk</th>
          </tr>
        </thead>
        <tbody>
          ${topItems.map(item => {
            const riskColor = item.riskLevel === 'critical' ? '#dc2626' :
                             item.riskLevel === 'high' ? '#f59e0b' :
                             item.riskLevel === 'medium' ? '#3b82f6' : '#10b981';
            return `
              <tr>
                <td style="padding: 10px; border: 1px solid #e5e7eb;">${item.userName}</td>
                <td style="padding: 10px; border: 1px solid #e5e7eb;">${item.appName}</td>
                <td style="padding: 10px; border: 1px solid #e5e7eb;">
                  <span style="background-color: ${riskColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">
                    ${item.riskLevel.toUpperCase()}
                  </span>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      ${hasMore ? `<p style="color: #666; font-style: italic;">...and ${reviewItems.length - 5} more</p>` : ''}

      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h4 style="margin-top: 0; color: #333;">Action Required</h4>
        <p>Please review each user's access and:</p>
        <ul>
          <li><strong>Approve</strong> if the access is still needed and appropriate</li>
          <li><strong>Revoke</strong> if the access is no longer needed or inappropriate</li>
          <li><strong>Defer</strong> if you need more information or time to decide</li>
        </ul>
        <p style="margin-bottom: 0;">
          <a href="${process.env.APP_URL || 'https://assetinfo.example.com'}/access-reviews"
             style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 10px;">
            Review Now
          </a>
        </p>
      </div>

      ${daysRemaining <= 1 ? `
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #dc2626;">⚠️ Deadline Approaching</h4>
          <p style="margin-bottom: 0; color: #991b1b;">
            This campaign is due ${daysRemaining === 0 ? 'today' : 'tomorrow'}. Please complete your reviews as soon as possible to maintain compliance.
          </p>
        </div>
      ` : ''}

      <p>If you have questions about any review, please contact your security team.</p>

      <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
      <p style="font-size: 12px; color: #666;">
        This email was sent automatically by the ${organizationName} IT Asset Management system.
      </p>
    </div>
  `;

  const text = `
Access Review Reminder

Hello ${reviewerName},

You have ${pendingCount} pending access review${pendingCount > 1 ? 's' : ''} that require your attention.

${urgencyLevel === 'urgent' ? '⚠️ URGENT' : urgencyLevel === 'high' ? '⏰ HIGH PRIORITY' : 'ℹ️ REMINDER'}

Campaign: ${campaignName}
Due Date: ${dueDateStr}
Time Remaining: ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}

Pending Reviews:
${topItems.map(item => `  - ${item.userName} - ${item.appName} (${item.riskLevel.toUpperCase()})`).join('\n')}
${hasMore ? `...and ${reviewItems.length - 5} more` : ''}

Action Required:
Please review each user's access and:
- Approve if the access is still needed and appropriate
- Revoke if the access is no longer needed or inappropriate
- Defer if you need more information or time to decide

Visit: ${process.env.APP_URL || 'https://assetinfo.example.com'}/access-reviews

${daysRemaining <= 1 ? `
⚠️ DEADLINE APPROACHING
This campaign is due ${daysRemaining === 0 ? 'today' : 'tomorrow'}. Please complete your reviews as soon as possible to maintain compliance.
` : ''}

If you have questions about any review, please contact your security team.

---
This email was sent automatically by the ${organizationName} IT Asset Management system.
  `;

  return { subject, html, text };
}
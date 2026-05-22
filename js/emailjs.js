// ============================================
// EMAILJS.JS — All email logic lives here
// Replace this file with PHP mailer on migration
// ============================================

function initEmailJS() {
  if (typeof emailjs !== 'undefined') {
    emailjs.init(CONFIG.emailjs.publicKey);
  }
}

async function sendWelcomeEmail(toName, toEmail) {
  try {
    await emailjs.send(CONFIG.emailjs.serviceId, CONFIG.emailjs.templates.welcome, {
      to_name: toName,
      to_email: toEmail,
      message: 'Your application has been received and is currently under review. We will notify you once a decision has been made.'
    });
  } catch (err) {
    console.error('Welcome email failed:', err);
  }
}

async function sendApprovedEmail(toName, toEmail) {
  try {
    await emailjs.send(CONFIG.emailjs.serviceId, CONFIG.emailjs.templates.approved, {
      to_name: toName,
      to_email: toEmail,
      message: 'Congratulations! Your application has been approved. You are now an active volunteer. Log in to your dashboard to get started.'
    });
  } catch (err) {
    console.error('Approval email failed:', err);
  }
}

async function sendRejectedEmail(toName, toEmail) {
  try {
    if (!CONFIG.emailjs.templates.rejected || CONFIG.emailjs.templates.rejected === 'YOUR_REJECTED_TEMPLATE_ID') return;
    await emailjs.send(CONFIG.emailjs.serviceId, CONFIG.emailjs.templates.rejected, {
      to_name: toName,
      to_email: toEmail,
      message: 'Thank you for your interest. Unfortunately your application was not successful at this time. We encourage you to apply again in the future.'
    });
  } catch (err) {
    console.error('Rejection email failed:', err);
  }
}

async function sendTaskAssignedEmail(toName, toEmail, taskTitle) {
  try {
    if (!CONFIG.emailjs.templates.taskAssigned || CONFIG.emailjs.templates.taskAssigned === 'YOUR_TASK_TEMPLATE_ID') return;
    await emailjs.send(CONFIG.emailjs.serviceId, CONFIG.emailjs.templates.taskAssigned, {
      to_name: toName,
      to_email: toEmail,
      message: `You have been assigned a new task: ${taskTitle}`
    });
  } catch (err) {
    console.error('Task email failed:', err);
  }
}

async function sendGroupAssignedEmail(toName, toEmail, groupName) {
  try {
    if (!CONFIG.emailjs.templates.groupAssigned || CONFIG.emailjs.templates.groupAssigned === 'YOUR_GROUP_TEMPLATE_ID') return;
    await emailjs.send(CONFIG.emailjs.serviceId, CONFIG.emailjs.templates.groupAssigned, {
      to_name: toName,
      to_email: toEmail,
      message: `You have been added to a new group: ${groupName}`
    });
  } catch (err) {
    console.error('Group email failed:', err);
  }
}

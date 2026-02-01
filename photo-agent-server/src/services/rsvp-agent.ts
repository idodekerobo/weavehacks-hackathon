import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import { createTracedOp, logAttributes } from './weave';
import fs from 'fs';
import path from 'path';

const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY;
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;

// Hardcoded user data for form filling
const USER_DATA = {
  email: 'idode.kerobo@gmail.com',
  firstName: 'Idode',
  lastName: 'Kerobo',
  phone: '2481230987',
  companyName: 'Stealth',
  jobTitle: 'Founder',
  linkedinUrl: 'https://www.linkedin.com/in/idodekerobo/',
};

export interface RSVPResult {
  success: boolean;
  eventUrl: string;
  confirmationNumber?: string;
  confirmationScreenshotPath?: string;
  sessionId?: string;
  recordingUrl?: string;
  error?: string;
  requiresPayment?: boolean;
  paymentAmount?: string;
  steps: RSVPStep[];
}

export interface RSVPStep {
  action: string;
  success: boolean;
  timestamp: number;
  details?: string;
  screenshotPath?: string;
}

/**
 * Execute RSVP automation for an event page
 */
const _executeRSVPImpl = async (
  eventUrl: string,
  eventName: string,
  assetId: string
): Promise<RSVPResult> => {
  
  if (!BROWSERBASE_API_KEY || !BROWSERBASE_PROJECT_ID) {
    throw new Error('Browserbase credentials not configured');
  }

  const steps: RSVPStep[] = [];
  let stagehand: Stagehand | null = null;
  let sessionId: string | undefined;
  
  const logStep = (action: string, success: boolean, details?: string, screenshotPath?: string) => {
    const step: RSVPStep = {
      action,
      success,
      timestamp: Date.now(),
      details,
      screenshotPath
    };
    steps.push(step);
    console.log(`📝 RSVP Step: ${action} - ${success ? '✅' : '❌'} ${details || ''}`);
  };

  logAttributes({
    operation: 'rsvp_automation',
    eventUrl,
    eventName,
    assetId
  });

  try {
    // Step 1: Initialize Browserbase session
    console.log('🌐 Starting RSVP automation for:', eventUrl);
    console.log('🎫 Event:', eventName);
    
    stagehand = new Stagehand({
      env: 'BROWSERBASE',
      apiKey: BROWSERBASE_API_KEY,
      projectId: BROWSERBASE_PROJECT_ID,
      verbose: 1
    });

    await stagehand.init();
    sessionId = stagehand.browserbaseSessionID;
    
    logStep('Initialize browser session', true, `Session ID: ${sessionId}`);
    console.log(`✅ Browserbase session: ${sessionId}`);
    console.log(`🎬 Recording: https://www.browserbase.com/sessions/${sessionId}`);

    logAttributes({
      sessionId,
      recordingUrl: `https://www.browserbase.com/sessions/${sessionId}`
    });

    const page = stagehand.context.pages()[0];

    // Step 2: Navigate to event page
    console.log('🔗 Navigating to event page...');
    await page.goto(eventUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    logStep('Navigate to event page', true, eventUrl);

    // Take initial screenshot
    const timestamp = Date.now();
    const screenshotDir = path.join(__dirname, '../../artifacts/screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    const initialScreenshotPath = path.join(screenshotDir, `rsvp_${timestamp}_initial.png`);
    await page.screenshot({ path: initialScreenshotPath, fullPage: true });
    logStep('Capture initial page', true, undefined, initialScreenshotPath);

    // Step 3: Look for RSVP/Register button
    console.log('🔍 Looking for RSVP/Register button...');
    
    // First, let's extract what buttons/links are available
    const pageInfoSchema = z.object({
      hasRSVPButton: z.boolean(),
      rsvpButtonText: z.string().optional(),
      hasRegisterButton: z.boolean(),
      registerButtonText: z.string().optional(),
      hasTicketButton: z.boolean(),
      ticketButtonText: z.string().optional(),
      hasSignUpButton: z.boolean(),
      signUpButtonText: z.string().optional(),
      isFreeEvent: z.boolean().optional(),
      ticketPrice: z.string().optional()
    });

    type PageInfo = z.infer<typeof pageInfoSchema>;

    const pageInfo: PageInfo = await stagehand.extract(
      `Look at this event page and identify:
      1. Is there an RSVP button? What does it say?
      2. Is there a Register button? What does it say?
      3. Is there a Get Tickets or Buy Tickets button? What does it say?
      4. Is there a Sign Up button? What does it say?
      5. Does this appear to be a free event?
      6. If there's a ticket price shown, what is it?`,
      pageInfoSchema as any
    ) as any;

    console.log('📊 Page analysis:', JSON.stringify(pageInfo, null, 2));
    logStep('Analyze page for RSVP options', true, JSON.stringify(pageInfo));

    // Check for payment requirement
    if (pageInfo.ticketPrice && !pageInfo.isFreeEvent) {
      const priceStr = pageInfo.ticketPrice;
      // Check if it's not free (contains $ and a number > 0)
      const priceMatch = priceStr.match(/\$?(\d+\.?\d*)/);
      if (priceMatch && parseFloat(priceMatch[1]) > 0) {
        console.log(`💰 Payment required: ${priceStr}`);
        logStep('Payment detected - stopping automation', false, `Price: ${priceStr}`);
        
        return {
          success: false,
          eventUrl,
          sessionId,
          recordingUrl: `https://www.browserbase.com/sessions/${sessionId}`,
          requiresPayment: true,
          paymentAmount: priceStr,
          error: `This event requires payment: ${priceStr}. Manual RSVP needed.`,
          steps
        };
      }
    }

    // Step 4: Click the RSVP/Register button
    let buttonClicked = false;
    const buttonOptions = [
      { has: pageInfo.hasRSVPButton, text: pageInfo.rsvpButtonText || 'RSVP' },
      { has: pageInfo.hasRegisterButton, text: pageInfo.registerButtonText || 'Register' },
      { has: pageInfo.hasSignUpButton, text: pageInfo.signUpButtonText || 'Sign Up' },
      { has: pageInfo.hasTicketButton && pageInfo.isFreeEvent, text: pageInfo.ticketButtonText || 'Get Tickets' }
    ];

    for (const option of buttonOptions) {
      if (option.has) {
        console.log(`🖱️ Clicking: "${option.text}"`);
        try {
          await stagehand.act(`click on the "${option.text}" button`);
          await page.waitForTimeout(3000);
          buttonClicked = true;
          logStep(`Click ${option.text} button`, true);
          break;
        } catch (e: any) {
          console.log(`⚠️ Failed to click "${option.text}": ${e.message}`);
          logStep(`Click ${option.text} button`, false, e.message);
        }
      }
    }

    if (!buttonClicked) {
      // Try generic approach
      console.log('🖱️ Trying generic RSVP action...');
      try {
        await stagehand.act('click the button to RSVP, register, or sign up for this event');
        await page.waitForTimeout(3000);
        buttonClicked = true;
        logStep('Click RSVP button (generic)', true);
      } catch (e: any) {
        logStep('Click RSVP button (generic)', false, e.message);
      }
    }

    if (!buttonClicked) {
      throw new Error('Could not find RSVP/Register button on the page');
    }

    // Take screenshot after clicking RSVP
    const afterRSVPPath = path.join(screenshotDir, `rsvp_${timestamp}_after_click.png`);
    await page.screenshot({ path: afterRSVPPath, fullPage: true });
    logStep('Capture page after RSVP click', true, undefined, afterRSVPPath);

    // Step 5: Check if we're now on a form page
    console.log('🔍 Checking for registration form...');
    
    const formSchema = z.object({
      hasForm: z.boolean(),
      hasEmailField: z.boolean(),
      hasNameFields: z.boolean(),
      hasPhoneField: z.boolean(),
      hasCompanyField: z.boolean(),
      hasLinkedInField: z.boolean(),
      formFields: z.array(z.string()).optional(),
      submitButtonText: z.string().optional(),
      isAlreadyRegistered: z.boolean().optional()
    });

    type FormInfo = z.infer<typeof formSchema>;

    const formInfo: FormInfo = await stagehand.extract(
      `Analyze this page for a registration form:
      1. Is there a form to fill out?
      2. Is there an email field?
      3. Are there name fields (first name, last name)?
      4. Is there a phone field?
      5. Is there a company field?
      6. Is there a LinkedIn field?
      7. What are all the form field labels?
      8. What does the submit button say?
      9. Does the page say you're already registered?`,
      formSchema as any
    ) as any;

    console.log('📋 Form analysis:', JSON.stringify(formInfo, null, 2));
    logStep('Analyze registration form', true, JSON.stringify(formInfo));

    // Check if already registered
    if (formInfo.isAlreadyRegistered) {
      console.log('✅ Already registered for this event!');
      logStep('Already registered', true);
      
      const confirmationPath = path.join(screenshotDir, `rsvp_${timestamp}_already_registered.png`);
      await page.screenshot({ path: confirmationPath, fullPage: true });
      
      return {
        success: true,
        eventUrl,
        confirmationNumber: 'ALREADY_REGISTERED',
        confirmationScreenshotPath: confirmationPath,
        sessionId,
        recordingUrl: `https://www.browserbase.com/sessions/${sessionId}`,
        steps
      };
    }

    // Step 6: Fill out the form
    if (formInfo.hasForm) {
      console.log('📝 Filling out registration form...');
      
      // Fill email
      if (formInfo.hasEmailField) {
        console.log(`  📧 Entering email: ${USER_DATA.email}`);
        try {
          await stagehand.act(`type "${USER_DATA.email}" into the email field`);
          logStep('Fill email field', true, USER_DATA.email);
        } catch (e: any) {
          logStep('Fill email field', false, e.message);
        }
      }

      // Fill name fields
      if (formInfo.hasNameFields) {
        console.log(`  👤 Entering name: ${USER_DATA.firstName} ${USER_DATA.lastName}`);
        try {
          await stagehand.act(`type "${USER_DATA.firstName}" into the first name field`);
          logStep('Fill first name', true, USER_DATA.firstName);
        } catch (e: any) {
          logStep('Fill first name', false, e.message);
        }
        
        try {
          await stagehand.act(`type "${USER_DATA.lastName}" into the last name field`);
          logStep('Fill last name', true, USER_DATA.lastName);
        } catch (e: any) {
          logStep('Fill last name', false, e.message);
        }
      }

      // Fill phone if present
      if (formInfo.hasPhoneField) {
        console.log(`  📱 Entering phone: ${USER_DATA.phone}`);
        try {
          await stagehand.act(`type "${USER_DATA.phone}" into the phone field`);
          logStep('Fill phone field', true, USER_DATA.phone);
        } catch (e: any) {
          logStep('Fill phone field', false, e.message);
        }
      }

      // Fill company if present
      if (formInfo.hasCompanyField) {
        console.log(`  🏢 Entering company: ${USER_DATA.companyName}`);
        try {
          await stagehand.act(`type "${USER_DATA.companyName}" into the company field`);
          logStep('Fill company field', true, USER_DATA.companyName);
        } catch (e: any) {
          logStep('Fill company field', false, e.message);
        }
      }

      // Fill LinkedIn if present
      if (formInfo.hasLinkedInField) {
        console.log(`  🔗 Entering LinkedIn: ${USER_DATA.linkedinUrl}`);
        try {
          await stagehand.act(`type "${USER_DATA.linkedinUrl}" into the LinkedIn field`);
          logStep('Fill LinkedIn field', true, USER_DATA.linkedinUrl);
        } catch (e: any) {
          logStep('Fill LinkedIn field', false, e.message);
        }
      }

      // Take screenshot of filled form
      const filledFormPath = path.join(screenshotDir, `rsvp_${timestamp}_form_filled.png`);
      await page.screenshot({ path: filledFormPath, fullPage: true });
      logStep('Capture filled form', true, undefined, filledFormPath);

      // Step 7: Submit the form
      console.log('📤 Submitting form...');
      const submitText = formInfo.submitButtonText || 'Submit';
      
      try {
        await stagehand.act(`click the "${submitText}" button to submit the registration`);
        await page.waitForTimeout(5000);
        logStep('Submit form', true, submitText);
      } catch (e: any) {
        // Try generic submit
        console.log('⚠️ Trying generic submit...');
        try {
          await stagehand.act('click the submit button or the button to complete registration');
          await page.waitForTimeout(5000);
          logStep('Submit form (generic)', true);
        } catch (e2: any) {
          logStep('Submit form', false, e2.message);
          throw new Error(`Failed to submit form: ${e2.message}`);
        }
      }
    } else {
      // No form - might be one-click RSVP
      console.log('✅ No form detected - might be one-click RSVP');
      logStep('One-click RSVP', true);
    }

    // Step 8: Capture confirmation
    console.log('📸 Capturing confirmation...');
    const confirmationPath = path.join(screenshotDir, `rsvp_${timestamp}_confirmation.png`);
    await page.screenshot({ path: confirmationPath, fullPage: true });
    logStep('Capture confirmation page', true, undefined, confirmationPath);

    // Try to extract confirmation details
    const confirmationSchema = z.object({
      isConfirmed: z.boolean(),
      confirmationMessage: z.string().optional(),
      confirmationNumber: z.string().optional(),
      eventDetails: z.string().optional()
    });

    type ConfirmationInfo = z.infer<typeof confirmationSchema>;

    let confirmationInfo: ConfirmationInfo;
    try {
      confirmationInfo = await stagehand.extract(
        `Look at this page and determine:
        1. Is this a confirmation page showing successful registration?
        2. What is the confirmation message?
        3. Is there a confirmation number or ticket number?
        4. What event details are shown?`,
        confirmationSchema as any
      ) as any;
      
      console.log('📋 Confirmation details:', JSON.stringify(confirmationInfo, null, 2));
      logStep('Extract confirmation details', true, JSON.stringify(confirmationInfo));
    } catch (e: any) {
      console.log('⚠️ Could not extract confirmation details:', e.message);
      confirmationInfo = { isConfirmed: true, confirmationMessage: 'Registration submitted' };
      logStep('Extract confirmation details', false, e.message);
    }

    logAttributes({
      outcome: 'success',
      confirmed: confirmationInfo.isConfirmed,
      confirmationNumber: confirmationInfo.confirmationNumber
    });

    return {
      success: confirmationInfo.isConfirmed !== false,
      eventUrl,
      confirmationNumber: confirmationInfo.confirmationNumber,
      confirmationScreenshotPath: confirmationPath,
      sessionId,
      recordingUrl: `https://www.browserbase.com/sessions/${sessionId}`,
      steps
    };

  } catch (error: any) {
    console.error('❌ RSVP automation failed:', error.message);
    console.error('Stack:', error.stack);
    
    logAttributes({
      outcome: 'error',
      error: error.message,
      errorStack: error.stack
    });

    logStep('RSVP automation error', false, error.message);

    return {
      success: false,
      eventUrl,
      sessionId,
      recordingUrl: sessionId ? `https://www.browserbase.com/sessions/${sessionId}` : undefined,
      error: error.message,
      steps
    };

  } finally {
    if (stagehand) {
      try {
        await stagehand.close();
        console.log('✅ Browserbase session closed');
      } catch (e: any) {
        console.error('⚠️ Failed to close session:', e.message);
      }
    }
  }
};

/**
 * Execute RSVP with Weave tracing
 */
export const executeRSVP = createTracedOp(
  'executeRSVP',
  _executeRSVPImpl
);

/**
 * Get user data (hardcoded for now)
 */
export function getUserData() {
  return USER_DATA;
}

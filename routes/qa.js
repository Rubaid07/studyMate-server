import { Router } from 'express';
import fetch from 'node-fetch';

const router = Router();

export default function qaRoutes(GEMINI_API_KEY) {
  router.post('/generate-qa', async (req, res) => {
    const { topic, difficulty = 'medium', type = 'mixed', count = 5, language = 'en' } = req.body || {};
      if (!topic) return res.status(400).json({ message: 'Topic is required' });
      if (!GEMINI_API_KEY) return res.status(500).json({ message: 'Gemini API key not configured' });
    
      const safeCount = Math.min(Math.max(Number(count) || 5, 1), 15);
      const safeDifficulty = ['easy','medium','hard'].includes(String(difficulty).toLowerCase())
        ? String(difficulty).toLowerCase()
        : 'medium';
      const safeType = ['mcq','short','truefalse','mixed'].includes(String(type).toLowerCase())
        ? String(type).toLowerCase()
        : 'mixed';
      const safeLanguage = ['en', 'bn'].includes(String(language).toLowerCase())
        ? String(language).toLowerCase()
        : 'en';
    
      // Enhanced prompts
      const geminiPrompts = {
        mcq: `
    Generate exactly ${safeCount} multiple-choice questions in ${safeLanguage === 'en' ? 'English' : 'Bengali'} about "${topic}" with ${safeDifficulty} difficulty level.
    
    **REQUIREMENTS:**
    - Each question must be unique and educational
    - Difficulty level: ${safeDifficulty} (adjust complexity accordingly)
    - Provide exactly 4 options per question (A, B, C, D)
    - Only one correct answer per question
    - Options should be plausible but distinct
    - Include diverse question types (factual, conceptual, application-based)
    
    **FORMAT:**
    Output ONLY valid JSON array with this exact structure:
    [
      {
        "question": "Clear question text",
        "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
        "correctAnswer": "A",
        "explanation": "Brief explanation of why this is correct"
      }
    ]
    
    **${safeLanguage === 'en' ? 'English Example:' : 'Bengali Example:'}**
    ${safeLanguage === 'en' 
      ? '[{"question": "What process do plants use to convert sunlight into energy?", "options": ["A) Respiration", "B) Photosynthesis", "C) Transpiration", "D) Fermentation"], "correctAnswer": "B", "explanation": "Photosynthesis is the process where plants convert light energy into chemical energy."}]'
      : '[{"question": "উদ্ভিদ সূর্যালোককে শক্তিতে রূপান্তর করতে কোন প্রক্রিয়া ব্যবহার করে?", "options": ["A) শ্বসন", "B) সালোকসংশ্লেষণ", "C) বাষ্পমোচন", "D) গাঁজন"], "correctAnswer": "B", "explanation": "সালোকসংশ্লেষণ হল সেই প্রক্রিয়া যেখানে উদ্ভিদ আলোর শক্তিকে রাসায়নিক শক্তিতে রূপান্তর করে।"}]'
    }`,
    
        short: `
    Generate exactly ${safeCount} short-answer questions with answers in ${safeLanguage === 'en' ? 'English' : 'Bengali'} about "${topic}" with ${safeDifficulty} difficulty level.
    
    **REQUIREMENTS:**
    - Questions should require concise but substantive answers
    - Answers should be accurate and educational
    - Vary question types (definition, explanation, comparison, example)
    - Difficulty level: ${safeDifficulty}
    
    **FORMAT:**
    Output ONLY valid JSON array with this exact structure:
    [
      {
        "question": "Clear question text",
        "answer": "Comprehensive but concise answer",
        "hint": "Optional hint if question is challenging"
      }
    ]
    
    **${safeLanguage === 'en' ? 'English Example:' : 'Bengali Example:'}**
    ${safeLanguage === 'en' 
      ? '[{"question": "What is the main function of mitochondria?", "answer": "Mitochondria are the powerhouses of the cell, producing ATP through cellular respiration.", "hint": "Think about energy production in cells"}]'
      : '[{"question": "মাইটোকন্ড্রিয়ার প্রধান কাজ কী?", "answer": "মাইটোকন্ড্রিয়া কোষের পাওয়ারহাউস, যা কোষীয় শ্বসনের মাধ্যমে ATP উৎপন্ন করে।", "hint": "কোষে শক্তি উৎপাদন সম্পর্কে চিন্তা করুন"}]'
    }`,
    
        truefalse: `
    Generate exactly ${safeCount} true/false questions in ${safeLanguage === 'en' ? 'English' : 'Bengali'} about "${topic}" with ${safeDifficulty} difficulty level.
    
    **REQUIREMENTS:**
    - Questions should be clearly true or false
    - Include some tricky questions that test understanding
    - Provide explanations for both true and false statements
    - Difficulty level: ${safeDifficulty}
    
    **FORMAT:**
    Output ONLY valid JSON array with this exact structure:
    [
      {
        "question": "Statement that is either true or false",
        "correctAnswer": "true/false",
        "explanation": "Detailed explanation of why the statement is true or false"
      }
    ]
    
    **${safeLanguage === 'en' ? 'English Example:' : 'Bengali Example:'}**
    ${safeLanguage === 'en' 
      ? '[{"question": "Water boils at 100 degrees Celsius at sea level.", "correctAnswer": "true", "explanation": "At standard atmospheric pressure (sea level), water boils at exactly 100°C."}]'
      : '[{"question": "সমুদ্রপৃষ্ঠে জল 100 ডিগ্রি সেলসিয়াসে ফুটতে শুরু করে।", "correctAnswer": "true", "explanation": "মানক বায়ুমণ্ডলীয় চাপে (সমুদ্রপৃষ্ঠ), জল ঠিক 100°C তাপমাত্রায় ফুটতে শুরু করে।"}]'
    }`,
    
        mixed: `
    Create a diverse set of ${safeCount} study questions in ${safeLanguage === 'en' ? 'English' : 'Bengali'} about "${topic}" with ${safeDifficulty} difficulty level.
    
    **REQUIREMENTS:**
    - Mix of question types: MCQ, short answer, and true/false
    - All questions should be educational and relevant to the topic
    - Vary cognitive levels (remember, understand, apply, analyze)
    - Difficulty level: ${safeDifficulty}
    
    **FORMAT:**
    Output ONLY valid JSON array with objects that can have these structures:
    
    For MCQ:
    {
      "type": "mcq",
      "question": "Question text",
      "options": ["A) Option1", "B) Option2", "C) Option3", "D) Option4"],
      "correctAnswer": "A",
      "explanation": "Brief explanation"
    }
    
    For short answer:
    {
      "type": "short",
      "question": "Question text",
      "answer": "Comprehensive answer",
      "hint": "Optional hint"
    }
    
    For true/false:
    {
      "type": "truefalse",
      "question": "Statement",
      "correctAnswer": "true/false",
      "explanation": "Detailed explanation"
    }
    `
      };
    
      let prompt;
      switch(safeType) {
        case 'mcq':
          prompt = geminiPrompts.mcq;
          break;
        case 'short':
          prompt = geminiPrompts.short;
          break;
        case 'truefalse':
          prompt = geminiPrompts.truefalse;
          break;
        case 'mixed':
        default:
          prompt = geminiPrompts.mixed;
      }
    
      const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
    
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          responseMimeType: 'application/json',
          temperature: 0.7,
          topP: 0.8
        }
      };
    
      const resp = await fetch(geminiApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    
      const data = await resp.json();
      
      // Check for content filtering
      if (data?.promptFeedback?.blockReason) {
        console.warn('Content filtered by Gemini:', data.promptFeedback.blockReason);
        return res.status(400).json({ 
          message: 'Content could not be generated due to safety policies',
          reason: data.promptFeedback.blockReason 
        });
      }
    
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        console.error('Gemini API: No text content in response:', data);
        return res.status(502).json({ message: 'Unexpected Gemini response', details: data });
      }
    
      let parsed;
      try {
        const cleaned = text.trim()
          .replace(/^```json/gi, '')
          .replace(/^```/gi, '')
          .replace(/```$/g, '')
          .trim();
        parsed = JSON.parse(cleaned);
      } catch (e) {
        console.error('❌ Failed to parse Gemini response JSON:', e);
        return res.status(502).json({ message: 'Gemini returned non-JSON', raw: text, error: e.message });
      }
    
      // Validate and enhance the response
      if (Array.isArray(parsed)) {
        parsed = parsed.map((item, index) => {
          // Add unique ID for frontend use
          item.id = `gemini-${Date.now()}-${index}`;
          
          // Ensure type field exists for mixed responses
          if (safeType === 'mixed' && !item.type) {
            if (item.options && item.correctAnswer) {
              item.type = 'mcq';
            } else if (item.correctAnswer === 'true' || item.correctAnswer === 'false') {
              item.type = 'truefalse';
            } else {
              item.type = 'short';
            }
          }
          
          // Ensure consistent field names
          if (item.type === 'mcq' && item.answer && !item.correctAnswer) {
            item.correctAnswer = item.answer;
            delete item.answer;
          }
          
          return item;
        });
      }
    
      res.json(parsed);
  });

  return router;
}

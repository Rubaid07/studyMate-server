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

    const geminiPrompts = {
        mcq: `
Generate exactly ${safeCount} multiple-choice questions in ${safeLanguage === 'en' ? 'English' : 'Bengali'} about "${topic}" with ${safeDifficulty} difficulty level.

SPECIAL REQUIREMENTS FOR BANGLADESH CURRICULUM:
- Questions must align with Bangladesh National Curriculum and Textbook Board (NCTB) standards
- For Bengali questions, use appropriate Bengali terminology and phrasing
- Consider grade-appropriate difficulty based on Bangladeshi education system
- Include questions that reflect Bangladeshi context and examples where relevant

ADDITIONAL REQUIREMENTS:
- Each question must be unique and educational
- Difficulty level: ${safeDifficulty} (adjust complexity accordingly)
- Provide exactly 4 options per question (A, B, C, D)
- Only one correct answer per question
- Options should be plausible but distinct
- Include diverse question types (factual, conceptual, application-based)

FORMAT:
Output ONLY valid JSON array with this exact structure:
[
  {
    "question": "Clear question text",
    "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
    "correctAnswer": "A",
    "explanation": "Brief explanation of why this is correct"
  }
]

${safeLanguage === 'en' ? 'English Example for Bangladesh Context:' : 'Bengali Example for Bangladesh Context:'}
${safeLanguage === 'en' 
    ? '[{"question": "Which is the longest river in Bangladesh?", "options": ["A) Padma", "B) Meghna", "C) Jamuna", "D) Brahmaputra"], "correctAnswer": "B", "explanation": "The Meghna is the longest river entirely within Bangladesh, stretching about 930 km."}]'
    : '[{"question": "বাংলাদেশের দীর্ঘতম নদী কোনটি?", "options": ["A) পদ্মা", "B) মেঘনা", "C) যমুনা", "D) ব্রহ্মপুত্র"], "correctAnswer": "B", "explanation": "মেঘনা নদী বাংলাদেশের মধ্যে সম্পূর্ণভাবে অবস্থিত দীর্ঘতম নদী, প্রায় ৯৩০ কিলোমিটার দীর্ঘ।"}]'
}`,

        short: `
Generate exactly ${safeCount} short-answer questions with answers in ${safeLanguage === 'en' ? 'English' : 'Bengali'} about "${topic}" with ${safeDifficulty} difficulty level.

SPECIAL REQUIREMENTS FOR BANGLADESH CURRICULUM:
- Questions must align with Bangladesh National Curriculum and Textbook Board (NCTB) standards
- For Bengali questions, use appropriate Bengali terminology and phrasing
- Consider grade-appropriate difficulty based on Bangladeshi education system
- Include questions that reflect Bangladeshi context and examples where relevant

ADDITIONAL REQUIREMENTS:
- Questions should require concise but substantive answers
- Answers should be accurate and educational
- Vary question types (definition, explanation, comparison, example)
- Difficulty level: ${safeDifficulty}

FORMAT:
Output ONLY valid JSON array with this exact structure:
[
  {
    "question": "Clear question text",
    "answer": "Comprehensive but concise answer",
    "hint": "Optional hint if question is challenging"
  }
]

${safeLanguage === 'en' ? 'English Example for Bangladesh Context:' : 'Bengali Example for Bangladesh Context:'}
${safeLanguage === 'en' 
    ? '[{"question": "What are the main agricultural products of Bangladesh?", "answer": "The main agricultural products of Bangladesh are rice, jute, tea, wheat, potatoes, and various fruits and vegetables.", "hint": "Think about what Bangladesh exports and consumes domestically"}]'
    : '[{"question": "বাংলাদেশের প্রধান কৃষি পণ্যগুলো কী কী?", "answer": "বাংলাদেশের প্রধান কৃষি পণ্যগুলো হলো ধান, পাট, চা, গম, আলু এবং বিভিন্ন ধরনের ফল ও শাকসবজি।", "hint": "বাংলাদেশ কী রপ্তানি করে এবং দেশীয়ভাবে কী consumed করে তা consider করুন"}]'
}`,

        truefalse: `
Generate exactly ${safeCount} true/false questions in ${safeLanguage === 'en' ? 'English' : 'Bengali'} about "${topic}" with ${safeDifficulty} difficulty level.

SPECIAL REQUIREMENTS FOR BANGLADESH CURRICULUM:
- Questions must align with Bangladesh National Curriculum and Textbook Board (NCTB) standards
- For Bengali questions, use appropriate Bengali terminology and phrasing
- Consider grade-appropriate difficulty based on Bangladeshi education system
- Include questions that reflect Bangladeshi context and examples where relevant

ADDITIONAL REQUIREMENTS:
- Questions should be clearly true or false
- Include some tricky questions that test understanding
- Provide explanations for both true and false statements
- Difficulty level: ${safeDifficulty}

FORMAT:
Output ONLY valid JSON array with this exact structure:
[
  {
    "question": "Statement that is either true or false",
    "correctAnswer": "true/false",
    "explanation": "Detailed explanation of why the statement is true or false"
  }
]

${safeLanguage === 'en' ? 'English Example for Bangladesh Context:' : 'Bengali Example for Bangladesh Context:'}
${safeLanguage === 'en' 
    ? '[{"question": "Sundarbans is the largest mangrove forest in Bangladesh.", "correctAnswer": "true", "explanation": "Yes, Sundarbans is indeed the largest mangrove forest in Bangladesh and also in the world, shared with India."}]'
    : '[{"question": "সুন্দরবন বাংলাদেশের বৃহত্তম ম্যানগ্রোভ বন।", "correctAnswer": "true", "explanation": "হ্যাঁ, সুন্দরবন действительно বাংলাদেশের বৃহত্তম ম্যানগ্রোভ বন এবং এটি বিশ্বেরও বৃহত্তম, যা ভারতের সাথে shared。"}]'
}`,

        mixed: `
Create a diverse set of ${safeCount} study questions in ${safeLanguage === 'en' ? 'English' : 'Bengali'} about "${topic}" with ${safeDifficulty} difficulty level.

SPECIAL REQUIREMENTS FOR BANGLADESH CURRICULUM:
- Questions must align with Bangladesh National Curriculum and Textbook Board (NCTB) standards
- For Bengali questions, use appropriate Bengali terminology and phrasing
- Consider grade-appropriate difficulty based on Bangladeshi education system
- Include questions that reflect Bangladeshi context and examples where relevant

ADDITIONAL REQUIREMENTS:
- Mix of question types: MCQ, short answer, and true/false
- All questions should be educational and relevant to the topic
- Vary cognitive levels (remember, understand, apply, analyze)
- Difficulty level: ${safeDifficulty}

FORMAT:
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

${safeLanguage === 'en' ? 'Note: Include questions relevant to Bangladesh context where appropriate.' : 'নোট: যেখানে উপযুক্ত সেখানে বাংলাদেশের প্রাসঙ্গিক প্রশ্ন অন্তর্ভুক্ত করুন।'}
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

    try {
        const resp = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) {
            throw new Error(`Gemini API responded with status: ${resp.status}`);
        }

        const data = await resp.json();
        
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

        if (Array.isArray(parsed)) {
            parsed = parsed.map((item, index) => {
                item.id = `gemini-${Date.now()}-${index}`;
                
                if (safeType === 'mixed' && !item.type) {
                    if (item.options && item.correctAnswer) {
                        item.type = 'mcq';
                    } else if (item.correctAnswer === 'true' || item.correctAnswer === 'false') {
                        item.type = 'truefalse';
                    } else if (item.answer) {
                        item.type = 'short';
                    }
                }
                
                if ((item.type === 'mcq' || safeType === 'mcq') && item.answer && !item.correctAnswer) {
                    item.correctAnswer = item.answer;
                    delete item.answer;
                }
                
                return item;
            });
        }

        res.json(parsed);
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        return res.status(500).json({ message: 'Failed to generate questions', error: error.message });
    }
});

  return router;
}

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI("YOUR_API_KEY");
async function testModels() {
  const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro', 'gemini-2.0-flash'];
  for (let m of models) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const result = await model.generateContent("hello");
      console.log(m + " WORKED");
    } catch(e) {
      console.log(m + " FAILED", e.message.substring(0, 100));
    }
  }
}
testModels();

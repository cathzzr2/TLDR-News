# TL;DR News

AI-powered Chrome extension for instant news and article summaries. Extract, summarize, and save articles with a beautiful floating interface.

## ✨ Features

- **AI Summarization**: Generate concise summaries using Hugging Face models
- **Model Selection**: Choose between fast (DistilBART) and balanced (BART Large) models
- **Multi-language Support**: Summarize in English, Chinese, Spanish, and French
- **Floating Interface**: Draggable, resizable window with theme customization
- **Smart Bookmarking**: Save articles with summaries and metadata
- **Native Sharing**: Share summaries with article title and link
- **Content Extraction**: Mozilla's Readability.js with DOM fallback

## 🚀 For Users

1. Navigate to any news or article page
2. Click the extension icon to open the floating window
3. Refresh to extract the main article content
4. Choose your preferred AI model and language
5. Summarize to generate an instant AI-powered summary
6. Save to bookmark the article and summary

## 🛠️ For Developers

### Setup
1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable Developer Mode
4. Click "Load unpacked" and select this project folder
5. Replace `'HUGGINGFACE_API_KEY'` in `content.js` with your Hugging Face API key

### API & Models
- **Hugging Face API**: For AI summarization and translation
- **Models Used**:
  - `sshleifer/distilbart-cnn-12-6` (Fast summaries)
  - `facebook/bart-large-cnn` (Balanced summaries)
  - `Helsinki-NLP/opus-mt-en-*` (Translation models)
- **Content Extraction**: Mozilla's Readability.js with DOM fallback
- **Storage**: Chrome Storage API for bookmarks and settings

### Demo
After setup, visit any news website and click the extension icon to see the floating window in action.

## 📋 Requirements

- Most Updated Chrome Browser
- Hugging Face API Key (free tier available)
- Internet connection for AI model inference

## 🔒 Privacy

- All data stays on your device
- Only article text sent to Hugging Face for summarization
- No personal information collected

## ⚠️ Known Issues

### Summarization Limitations
Due to free tier model constraints, the current summarization has limitations:
- **Token Length Limits**: Free Hugging Face models have query token limits (usually ~10 sentences)
- **Chunking Required**: Long articles must be split into chunks for processing
- **Coherence Loss**: Combining chunk summaries can reduce article coherence
- **Improvement Needed**: Better chunking algorithms and summary combination methods are needed
- **Multilingual Support**: Current free model only supports English, Chinese, Spanish, and French translation with restricted accuracy. 

## 🤝 Open Source Community

This project is open source and welcomes contributions! We believe in building better reading experiences together.

### How to Contribute

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b your-name/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin your-name/amazing-feature`)
5. **Open** a Pull Request

### Contribution Guidelines

- **Code Quality**: Write clean, well-documented code
- **Testing**: Test your changes thoroughly before submitting
- **Issues**: Report bugs and suggest features via GitHub Issues
- **Documentation**: Update README and comments when adding features
- **Respect**: Be respectful and constructive in discussions

### Potential Areas for Improvement

- **Better Summarization**: Improve chunking and summary combination algorithms
- **UI/UX Enhancements**: Improve user interface and experience
- **Performance**: Optimize content extraction and processing
- **Language Support**: Add more translation languages
- **Error Handling**: Better error messages and fallback mechanisms
- You name it!

---

**Made with ❤️ for better reading experiences**

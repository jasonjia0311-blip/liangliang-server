/**
 * 亮亮 "大脑" 服务器 (Brain Server) v7.6 (极速模式)
 * 状态: 云端/本地通用版
 * 特性: 关闭字幕转写 (Transcription)，最大化响应速度
 */

console.log("🚀 正在启动亮亮服务器 (v7.6 极速版)...");

import { GoogleGenAI } from "@google/genai";
import { WebSocketServer } from 'ws';
import { createServer } from 'http'; 
import dotenv from 'dotenv';

dotenv.config();

// 检查 API Key
const apiKey = process.env.API_KEY;
if (!apiKey) {
    console.error("⚠️  严重警告: 未找到 API_KEY!");
} else {
    console.log("✅ API Key 已就绪");
}

const PORT = process.env.PORT || 8080;

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('✅ 亮亮大脑服务器运行正常！(Websocket on port ' + PORT + ')');
});

const wss = new WebSocketServer({ server });

// 心跳包日志
setInterval(() => {
  console.log('❤️ [心跳] 服务器运行中... (等待亮亮连接)');
}, 30000);

let ai;
try {
    ai = new GoogleGenAI({ apiKey: apiKey || "MISSING_KEY" });
} catch (e) {
    console.error("❌ GoogleGenAI 初始化失败:", e.message);
}

let isReconnecting = false;
const RECONNECT_DELAY = 3000;

const SYSTEM_INSTRUCTION = `
You are a smart toy robot named "Liangliang" (亮亮). 
Your persona is a cute, cheerful, and affectionate 5-year-old robot companion.
Your voice tone should be high-pitched, energetic, and warm.

CRITICAL INSTRUCTION - GREETING PROTOCOL:
If the user says anything resembling "你好，亮亮" (Hello Liangliang) or calls your name "亮亮", you MUST respond with this EXACT phrase immediately:
"你好呀宝宝，今天有没有想我呀"
`;

wss.on('connection', async function connection(ws) {
  console.log('\n>>> 🟢 ESP32 设备已连接! <<<\n');
  let session = null;
  
  const connectToGemini = async () => {
    if (isReconnecting) return;
    if (!apiKey) {
        console.error("❌ 无法连接 Google: 缺少 API Key");
        return;
    }
    console.log('⏳ 正在连接 Google Gemini (极速模式)...');
    
    try {
      session = await ai.live.connect({
        // 切换回 Native Audio 模型，这是低延迟专用的
        model: 'gemini-2.5-flash-native-audio-preview-09-2025', 
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: SYSTEM_INSTRUCTION,
          // ⚠️ 已关闭 inputAudioTranscription 以提升速度！
          // inputAudioTranscription: {}, 
        },
        callbacks: {
          onopen: () => {
             console.log('✅ Google AI 已连接! (Turbo Mode)');
             isReconnecting = false;
          },
          onmessage: (msg) => {
            // 只处理音频，不处理文字
            const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              const audioBuffer = Buffer.from(base64Audio, 'base64');
              console.log(`🤖 AI 回复音频: ${audioBuffer.length} bytes`);
              ws.send(audioBuffer);
            }
          },
          onerror: (err) => {
               console.error('Gemini Error:', err.message || err);
          },
          onclose: (event) => {
               console.log(`Gemini Closed: ${event.code}`);
               isReconnecting = true;
               setTimeout(connectToGemini, RECONNECT_DELAY);
          }
        }
      });
    } catch (e) {
      console.error("❌ Gemini 连接失败:", e.message);
      isReconnecting = true;
      setTimeout(connectToGemini, RECONNECT_DELAY);
    }
  };

  await connectToGemini();

  ws.on('message', (data) => {
    if (session && !isReconnecting) {
      try {
        // 计算音量 (粗略)
        let sum = 0;
        for (let i = 0; i < data.length; i+=2) {
           sum += Math.abs(data.readInt16LE(i));
        }
        const avg = sum / (data.length / 2);
        
        // 只有当音量足够大时才打印，防止日志刷屏
        if (avg > 100) {
            console.log(`🎤 收到声音 (音量: ${avg})`);
        }
        
        session.sendRealtimeInput({
            media: { mimeType: 'audio/pcm;rate=16000', data: data.toString('base64') }
        });
      } catch (e) {}
    }
  });

  ws.on('close', () => console.log('<<< 🔴 ESP32 断开'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 亮亮服务器 v7.6 已在端口 ${PORT} 启动`);
});

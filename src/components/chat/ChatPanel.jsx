import { useRef, useEffect } from 'react';
import { MessageSquare, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useStore from '../../store/useStore';
import { api } from '../../services/api';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';

export default function ChatPanel() {
  const {
    chatMessages,
    addChatMessage,
    isChatLoading,
    setIsChatLoading,
    setChatError,
    parsedData,
    analysis,
    selectedCurrency,
    toggleChat,
  } = useStore();

  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading]);

  const handleSend = async (question) => {
    addChatMessage({ role: 'user', content: question });
    setIsChatLoading(true);

    try {
      const history = chatMessages
        .reduce((acc, msg) => {
          if (msg.role === 'user') {
            acc.push({ question: msg.content, answer_summary: '' });
          } else if (msg.items && acc.length > 0) {
            const textItems = msg.items.filter((i) => i.type === 'text');
            acc[acc.length - 1].answer_summary =
              textItems.map((t) => t.content).join(' ').slice(0, 200);
          }
          return acc;
        }, [])
        .slice(-6);

      const result = await api.chat({
        question,
        headers: parsedData.headers,
        column_meta: parsedData.columnMeta,
        sample_rows: parsedData.rows.slice(0, 50),
        total_rows: parsedData.totalRows,
        currency: selectedCurrency || '$',
        conversation_history: history,
        sector: analysis?.sector || '',
        org_type: analysis?.org_type || '',
      });

      addChatMessage({
        role: 'assistant',
        items: result.items || [],
        followUps: result.follow_ups || [],
      });
    } catch (err) {
      addChatMessage({
        role: 'assistant',
        items: [
          {
            type: 'text',
            content:
              "I couldn't process that question right now. Please try rephrasing or ask something else.",
          },
        ],
        followUps: [],
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  const lastAssistantMsg = [...chatMessages]
    .reverse()
    .find((m) => m.role === 'assistant');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary-500" />
          <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
            Ask Your Data
          </h3>
        </div>
        <button
          onClick={toggleChat}
          className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {chatMessages.length === 0 && (
          <div className="text-center py-12">
            <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center mx-auto mb-3">
              <MessageSquare className="w-6 h-6 text-primary-500" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Ask anything about your data
            </p>
            <p className="text-xs text-slate-400 mb-6">
              Get insights as charts, tables, or plain explanations.
            </p>
            <div className="space-y-2">
              {[
                'What are the top 5 performing items?',
                'Show me the trend over time',
                'Which category has the highest average?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg border
                             hover:bg-primary-50 dark:hover:bg-primary-950/20
                             hover:border-primary-300 dark:hover:border-primary-700
                             text-slate-600 dark:text-slate-300 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatMessages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {isChatLoading && (
          <div className="flex items-center gap-2 mb-4">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" />
              <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
            <span className="text-xs text-slate-400">Thinking...</span>
          </div>
        )}

        {/* Follow-up suggestions */}
        {lastAssistantMsg?.followUps?.length > 0 && !isChatLoading && (
          <div className="mt-2 mb-4 space-y-1.5">
            {lastAssistantMsg.followUps.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSend(q)}
                className="w-full text-left text-xs px-3 py-2 rounded-lg border
                           hover:bg-primary-50 dark:hover:bg-primary-950/20
                           hover:border-primary-300 dark:hover:border-primary-700
                           text-slate-600 dark:text-slate-300 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isChatLoading} />
    </div>
  );
}

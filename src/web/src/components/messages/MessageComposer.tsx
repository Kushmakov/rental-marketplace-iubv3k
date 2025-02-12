import React, { useState, useRef, useCallback, useEffect } from 'react';
import { TextField, IconButton, Box, Paper, CircularProgress } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import EmojiEmotionsIcon from '@mui/icons-material/EmojiEmotions';
import CloseIcon from '@mui/icons-material/Close';
import EmojiPicker from 'emoji-picker-react';
import { debounce } from 'lodash';
import sanitizeHtml from 'sanitize-html';

import { Message, MessageType, MessageAttachment } from '../../types/message';
import { useMessages } from '../../hooks/useMessages';

// Constants for message validation and rate limiting
const MAX_MESSAGE_LENGTH = 2000;
const MAX_ATTACHMENTS = 5;
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf', 'application/docx'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const TYPING_DEBOUNCE_MS = 500;

interface MessageComposerProps {
  threadId: string;
  onMessageSent?: (message: Message) => void;
  onTypingStart?: () => void;
  onTypingEnd?: () => void;
  onDeliveryStatusChange?: (status: 'sent' | 'delivered' | 'read') => void;
  onReadStatusChange?: (status: 'read' | 'unread') => void;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  threadId,
  onMessageSent,
  onTypingStart,
  onTypingEnd,
  onDeliveryStatusChange,
  onReadStatusChange,
}) => {
  // State management
  const [messageText, setMessageText] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  // Custom hook for message management
  const { 
    sendMessage, 
    setTypingStatus, 
    saveDraft, 
    draftMessages 
  } = useMessages({
    threadId,
    limit: 50,
  }, {
    enableEncryption: true,
    enableOfflineSupport: true,
    enableTypingIndicators: true,
    enableReadReceipts: true,
  });

  // Load draft message on component mount
  useEffect(() => {
    const draft = draftMessages[threadId];
    if (draft) {
      setMessageText(draft);
    }
  }, [threadId, draftMessages]);

  // Debounced typing indicator
  const debouncedTypingIndicator = useCallback(
    debounce((isTyping: boolean) => {
      setTypingStatus(threadId, isTyping);
      if (isTyping) {
        onTypingStart?.();
      } else {
        onTypingEnd?.();
      }
    }, TYPING_DEBOUNCE_MS),
    [threadId, onTypingStart, onTypingEnd]
  );

  // Handle message text changes
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    if (text.length <= MAX_MESSAGE_LENGTH) {
      setMessageText(text);
      saveDraft(threadId, text);
      debouncedTypingIndicator(text.length > 0);
    }
  };

  // Handle file attachments
  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    // Validate file count
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setError(`Maximum ${MAX_ATTACHMENTS} files allowed`);
      return;
    }

    // Validate each file
    const validFiles = files.filter(file => {
      if (!ALLOWED_FILE_TYPES.includes(file.type)) {
        setError(`File type ${file.type} not allowed`);
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`File ${file.name} exceeds maximum size of 10MB`);
        return false;
      }
      return true;
    });

    setIsUploading(true);
    try {
      setAttachments(prev => [...prev, ...validFiles]);
      setUploadProgress(0);
      
      // Simulated upload progress
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setIsUploading(false);
            return 100;
          }
          return prev + 10;
        });
      }, 100);
    } catch (err) {
      setError('Failed to upload attachments');
      setIsUploading(false);
    }
  };

  // Handle message submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!messageText.trim() && attachments.length === 0) {
      return;
    }

    // Sanitize message content
    const sanitizedContent = sanitizeHtml(messageText.trim(), {
      allowedTags: [], // Strip all HTML tags
      allowedAttributes: {},
    });

    try {
      const message = await sendMessage(
        sanitizedContent,
        threadId,
        attachments.length > 0 ? MessageType.DOCUMENT : MessageType.TEXT,
        attachments,
        {
          hasAttachments: attachments.length > 0,
          clientTimestamp: new Date().toISOString(),
        }
      );

      // Clear form and state
      setMessageText('');
      setAttachments([]);
      setShowEmojiPicker(false);
      saveDraft(threadId, '');
      
      // Notify parent components
      onMessageSent?.(message);
      onDeliveryStatusChange?.('sent');
      
      // Focus input for next message
      messageInputRef.current?.focus();
    } catch (err) {
      setError('Failed to send message. Please try again.');
    }
  };

  // Handle emoji selection
  const handleEmojiSelect = (event: any, emojiObject: any) => {
    setMessageText(prev => prev + emojiObject.emoji);
    setShowEmojiPicker(false);
    messageInputRef.current?.focus();
  };

  // Remove attachment
  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Paper 
      elevation={3}
      sx={{ 
        p: 2,
        position: 'relative',
        backgroundColor: 'background.paper'
      }}
    >
      {error && (
        <Box 
          sx={{ 
            color: 'error.main',
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span>{error}</span>
          <IconButton size="small" onClick={() => setError(null)}>
            <CloseIcon />
          </IconButton>
        </Box>
      )}

      <form onSubmit={handleSubmit}>
        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            placeholder="Type your message..."
            value={messageText}
            onChange={handleTextChange}
            inputRef={messageInputRef}
            error={!!error}
            disabled={isUploading}
            InputProps={{
              sx: { backgroundColor: 'background.default' }
            }}
          />
        </Box>

        {attachments.length > 0 && (
          <Box sx={{ mb: 2 }}>
            {attachments.map((file, index) => (
              <Box
                key={index}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1,
                  p: 1,
                  backgroundColor: 'action.hover',
                  borderRadius: 1
                }}
              >
                <span>{file.name}</span>
                <IconButton 
                  size="small" 
                  onClick={() => handleRemoveAttachment(index)}
                  disabled={isUploading}
                >
                  <CloseIcon />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAttachmentUpload}
              multiple
              accept={ALLOWED_FILE_TYPES.join(',')}
              style={{ display: 'none' }}
            />
            
            <IconButton 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || attachments.length >= MAX_ATTACHMENTS}
            >
              <AttachFileIcon />
            </IconButton>

            <IconButton 
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={isUploading}
            >
              <EmojiEmotionsIcon />
            </IconButton>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isUploading && (
              <CircularProgress 
                variant="determinate" 
                value={uploadProgress} 
                size={24} 
              />
            )}
            
            <IconButton 
              color="primary"
              type="submit"
              disabled={isUploading || (!messageText.trim() && attachments.length === 0)}
            >
              <SendIcon />
            </IconButton>
          </Box>
        </Box>
      </form>

      {showEmojiPicker && (
        <Box 
          sx={{ 
            position: 'absolute',
            bottom: '100%',
            right: 0,
            zIndex: 1000
          }}
        >
          <EmojiPicker onEmojiClick={handleEmojiSelect} />
        </Box>
      )}
    </Paper>
  );
};
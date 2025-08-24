import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, CheckCircle, AlertCircle, X, Loader2, RefreshCw } from 'lucide-react';
import { documentAPI, UploadResponse } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { analyzeError, createRetryFunction, showErrorToast } from '@/lib/errorHandling';

interface UploadedDocument {
  id: string;
  name: string;
  size: string;
  uploadedAt: Date;
  chunksProcessed?: number;
}

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'completed' | 'error';

const DocumentUpload: React.FC = () => {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDocument[]>([]);
  const [lastError, setLastError] = useState<unknown>(null);
  const [retryCount, setRetryCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const uploadFile = async (file: File): Promise<UploadResponse> => {
    return await documentAPI.upload(file, (progressEvent) => {
      if (progressEvent.lengthComputable) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadProgress(percentCompleted);
        
        // Switch to processing status when upload is complete
        if (percentCompleted === 100) {
          setUploadStatus('processing');
        }
      }
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const allowedExtensions = ['.pdf', '.txt', '.docx'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF, TXT, or DOCX file.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    setUploadStatus('uploading');
    setUploadProgress(0);
    setCurrentFileName(file.name);
    setLastError(null);
    setRetryCount(0);

    // Create retry function with exponential backoff
    const retryUpload = createRetryFunction(() => uploadFile(file), 3, 2000);

    try {
      const uploadResponse = await retryUpload();
      
      setUploadStatus('completed');

      // Add to uploaded documents list
      const newDoc: UploadedDocument = {
        id: Date.now().toString(),
        name: file.name,
        size: formatFileSize(file.size),
        uploadedAt: new Date(),
        chunksProcessed: uploadResponse.num_chunks_stored,
      };
      setUploadedDocs(prev => [newDoc, ...prev]);

      toast({
        title: "Upload successful",
        description: `${uploadResponse.filename} has been processed into ${uploadResponse.num_chunks_stored} chunks.`,
      });

      // Reset after a brief delay to show completion
      setTimeout(() => {
        setUploadStatus('idle');
        setUploadProgress(0);
        setCurrentFileName('');
        setLastError(null);
      }, 2000);

    } catch (error: unknown) {
      console.error('Upload failed:', error);
      setUploadStatus('error');
      setLastError(error);
      
      const errorInfo = analyzeError(error);
      showErrorToast(error, `Upload failed: ${errorInfo.userMessage}`);

      // Don't auto-reset on error - let user decide to retry or cancel
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRetry = async () => {
    if (!lastError) return;
    
    setRetryCount(prev => prev + 1);
    setUploadStatus('uploading');
    setUploadProgress(0);

    // Get the file from the input (if still available) or ask user to select again
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast({
        title: "File not found",
        description: "Please select the file again to retry upload.",
        variant: "destructive",
      });
      setUploadStatus('idle');
      return;
    }

    try {
      const uploadResponse = await uploadFile(file);
      
      setUploadStatus('completed');

      // Add to uploaded documents list
      const newDoc: UploadedDocument = {
        id: Date.now().toString(),
        name: file.name,
        size: formatFileSize(file.size),
        uploadedAt: new Date(),
        chunksProcessed: uploadResponse.num_chunks_stored,
      };
      setUploadedDocs(prev => [newDoc, ...prev]);

      toast({
        title: "Upload successful",
        description: `${uploadResponse.filename} has been processed into ${uploadResponse.num_chunks_stored} chunks.`,
      });

      // Reset after success
      setTimeout(() => {
        setUploadStatus('idle');
        setUploadProgress(0);
        setCurrentFileName('');
        setLastError(null);
        setRetryCount(0);
      }, 2000);

    } catch (error: unknown) {
      console.error('Retry upload failed:', error);
      setUploadStatus('error');
      setLastError(error);
      showErrorToast(error, 'Retry failed. Please try again.');
    }
  };

  const handleCancel = () => {
    setUploadStatus('idle');
    setUploadProgress(0);
    setCurrentFileName('');
    setLastError(null);
    setRetryCount(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeDocument = (id: string) => {
    setUploadedDocs(prev => prev.filter(doc => doc.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Document Upload
          </CardTitle>
          <CardDescription>
            Upload PDF or TXT files to ask questions about their content
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
          
          {uploadStatus === 'error' ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  onClick={handleRetry}
                  variant="default"
                  className="flex-1"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry Upload {retryCount > 0 && `(${retryCount})`}
                </Button>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  className="flex-1"
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </div>
              {lastError && (
                <div className="text-xs text-destructive text-center">
                  {analyzeError(lastError).userMessage}
                </div>
              )}
            </div>
          ) : (
            <Button
              onClick={handleFileSelect}
              disabled={uploadStatus !== 'idle'}
              className="w-full bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-glow transition-smooth"
            >
              {uploadStatus === 'uploading' || uploadStatus === 'processing' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : uploadStatus === 'completed' ? (
                <CheckCircle className="mr-2 h-4 w-4" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {uploadStatus === 'uploading' ? 'Uploading...' : 
               uploadStatus === 'processing' ? 'Processing...' :
               uploadStatus === 'completed' ? 'Upload Complete!' :
               'Select Document'}
            </Button>
          )}

          {uploadStatus !== 'idle' && (
            <div className="space-y-3">
              {currentFileName && (
                <div className="text-sm text-muted-foreground text-center">
                  {uploadStatus === 'uploading' ? 'Uploading' : 
                   uploadStatus === 'processing' ? 'Processing' : 
                   uploadStatus === 'completed' ? 'Completed' : 'Failed'}: {currentFileName}
                </div>
              )}
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {uploadStatus === 'uploading' ? 'Upload Progress' :
                     uploadStatus === 'processing' ? 'Processing Document...' :
                     uploadStatus === 'completed' ? 'Processing Complete' :
                     'Upload Failed'}
                  </span>
                  {uploadStatus === 'uploading' && (
                    <span>{Math.round(uploadProgress)}%</span>
                  )}
                </div>
                <Progress 
                  value={uploadStatus === 'processing' ? 100 : uploadProgress} 
                  className="h-2"
                />
                {uploadStatus === 'processing' && (
                  <div className="text-xs text-muted-foreground text-center">
                    Chunking document and creating embeddings...
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Supported formats: PDF, TXT, DOCX • Max size: 10MB
          </p>
        </CardContent>
      </Card>

      {/* Uploaded Documents */}
      {uploadedDocs.length > 0 && (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Uploaded Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploadedDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]">
                        {doc.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {doc.size} • {doc.uploadedAt.toLocaleDateString()}
                        {doc.chunksProcessed && ` • ${doc.chunksProcessed} chunks`}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeDocument(doc.id)}
                    className="h-8 w-8 p-0 hover:bg-destructive/20"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DocumentUpload;
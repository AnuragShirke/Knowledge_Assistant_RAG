import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, CheckCircle, AlertCircle, X, Loader2, RefreshCw } from 'lucide-react';
import { documentAPI, UploadResponse } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { analyzeError, createRetryFunction, showErrorToast } from '@/lib/errorHandling';

interface UploadStatus {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'failed';
  message: string;
  response?: UploadResponse;
}

export const DocumentUpload: React.FC = () => {
  const [uploads, setUploads] = useState<UploadStatus[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files).map(file => ({
        file,
        progress: 0,
        status: 'pending',
        message: 'Ready to upload',
      }));
      setUploads(prev => [...prev, ...newFiles]);
    }
  };

  const startUpload = async (uploadIndex: number) => {
    setUploads(prev => prev.map((u, i) => i === uploadIndex ? { ...u, status: 'uploading', message: 'Uploading...' } : u));
    
    const currentUpload = uploads[uploadIndex];
    if (!currentUpload) return;

    try {
      const uploadFileWithRetry = createRetryFunction(documentAPI.upload, 3, 2000);
      const response = await uploadFileWithRetry(currentUpload.file);
      
      setUploads(prev => prev.map((u, i) => 
        i === uploadIndex ? { ...u, status: 'success', progress: 100, message: response.message, response } : u
      ));
      toast({
        title: "Upload Successful",
        description: response.message,
      });
    } catch (error: any) {
      console.error('Upload failed:', error);
      setUploads(prev => prev.map((u, i) => 
        i === uploadIndex ? { ...u, status: 'failed', message: analyzeError(error) } : u
      ));
      showErrorToast(error, "Upload Failed");
    }
  };

  const handleUploadAll = () => {
    uploads.forEach((_, index) => {
      if (uploads[index].status === 'pending' || uploads[index].status === 'failed') {
        startUpload(index);
      }
    });
  };

  const handleRemoveUpload = (index: number) => {
    setUploads(prev => prev.filter((_, i) => i !== index));
  };

  const getStatusIcon = (status: UploadStatus['status']) => {
    switch (status) {
      case 'pending': return <FileText className="h-4 w-4 text-gray-500" />;
      case 'uploading': return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Upload Documents</h2>
      
      <div className="flex items-center space-x-2">
        <Button onClick={() => fileInputRef.current?.click()} className="flex-1">
          <Upload className="mr-2 h-4 w-4" /> Select Files
        </Button>
        <input 
          type="file" 
          ref={fileInputRef} 
          multiple 
          className="hidden" 
          onChange={handleFileChange} 
        />
        <Button onClick={handleUploadAll} disabled={uploads.every(u => u.status === 'success' || u.status === 'uploading')}>
          <RefreshCw className="mr-2 h-4 w-4" /> Upload All
        </Button>
      </div>

      {uploads.length > 0 && (
        <div className="border rounded-md p-4 space-y-3">
          {uploads.map((upload, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="flex-shrink-0">{getStatusIcon(upload.status)}</div>
              <div className="flex-1 text-sm overflow-hidden">
                <p className="truncate font-medium">{upload.file.name}</p>
                <p className="text-xs text-gray-500">{upload.message}</p>
                <Progress value={upload.progress} className="mt-1" />
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleRemoveUpload(index)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import { useState } from "react";
import { Copy, Check, Download, FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface NotebookLmExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseTitle: string;
  groupName: string;
  text: string;
  questionCount: number;
  loading?: boolean;
}

export function NotebookLmExportModal({
  open,
  onOpenChange,
  courseTitle,
  groupName,
  text,
  questionCount,
  loading = false,
}: NotebookLmExportModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`Copied ${questionCount} questions to clipboard!`, {
        description: "Ready to paste directly into Google NotebookLM.",
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Failed to copy to clipboard. Please select and copy manually.");
    }
  };

  const handleDownloadTxt = () => {
    if (!text) return;
    try {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeCourse = courseTitle.replace(/[^a-zA-Z0-9_\u0600-\u06FF]+/g, "_");
      const safeGroup = groupName.replace(/[^a-zA-Z0-9_\u0600-\u06FF]+/g, "_");
      link.href = url;
      link.download = `${safeCourse}_${safeGroup}_NotebookLM.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Downloaded .txt file for NotebookLM!");
    } catch {
      toast.error("Failed to trigger download.");
    }
  };

  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-3 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
              <Sparkles className="w-3 h-3 text-indigo-600" />
              NotebookLM Export
            </span>
            <span className="text-xs text-muted-foreground">• Section: {groupName}</span>
          </div>
          <DialogTitle className="text-xl font-bold text-foreground">
            Copy Section Questions
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Questions and options only — answers and explanations are excluded so NotebookLM can solve them accurately.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Preparing questions for NotebookLM...</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-3 py-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <span><strong>{questionCount}</strong> questions</span>
                <span>•</span>
                <span><strong>{wordCount.toLocaleString()}</strong> words</span>
              </div>
              <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                ✓ Ready for NotebookLM
              </span>
            </div>

            <div className="relative flex-1 min-h-[300px] max-h-[460px] overflow-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-xs leading-relaxed text-foreground select-text whitespace-pre-wrap">
              {text || "No questions found in this section."}
            </div>
          </div>
        )}

        <DialogFooter className="pt-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-muted-foreground text-left">
            Tip: You can paste this in NotebookLM chat or upload it as a source document.
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTxt}
              disabled={loading || !text}
              className="flex-1 sm:flex-none"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Download .txt
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCopy}
              disabled={loading || !text}
              className="flex-1 sm:flex-none font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-1.5 text-white" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-1.5" />
                  Copy to Clipboard
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

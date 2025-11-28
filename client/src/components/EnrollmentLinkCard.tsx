import * as React from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, ExternalLink, QrCode } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GlassCard } from "@/components/ui-custom";

type Props = {
  /** optional override (e.g. when behind a proxy) */
  baseUrl?: string;
};

type EnrollmentTokenData = {
  token: string | null;
  name?: string;
  expiresAt?: string;
};

export function EnrollmentLinkCard({ baseUrl }: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Get origin and replace 0.0.0.0 with localhost for browser compatibility
  const origin = typeof window !== "undefined" 
    ? window.location.origin.replace('0.0.0.0', 'localhost')
    : "";
  
  const queryClient = useQueryClient();

  // Fetch active enrollment token
  const { data: tokenData, isLoading, refetch } = useQuery<EnrollmentTokenData>({
    queryKey: ["/api/enrollment-tokens/active"],
  });

  const enrollUrl = useMemo(() => {
    if (!tokenData?.token) {
      return `${baseUrl || origin}/enroll`;
    }
    return `${baseUrl || origin}/enroll/${tokenData.token}`;
  }, [baseUrl, origin, tokenData]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(enrollUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      toast({ title: "Link copied", description: "Share it in Teams/WhatsApp/Email" });
    } catch {
      toast({ title: "Copy failed", description: enrollUrl, variant: "destructive" });
    }
  }

  const handleCreateToken = async () => {
    setCreating(true);
    try {
      const response = await fetch('/api/enrollment-tokens/ensure-default', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('token'),
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast({ 
          title: "Success!", 
          description: "Enrollment token created successfully" 
        });
        // Invalidate and refetch the token
        await queryClient.invalidateQueries({ queryKey: ["/api/enrollment-tokens/active"] });
        await refetch();
        setCreating(false);
      } else {
        toast({ 
          title: "Error", 
          description: data.message || "Failed to create token",
          variant: "destructive" 
        });
        setCreating(false);
      }
    } catch (error) {
      console.error('Token creation error:', error);
      toast({ 
        title: "Error", 
        description: "Failed to create enrollment token",
        variant: "destructive" 
      });
      setCreating(false);
    }
  };

  if (isLoading) {
    return (
      <GlassCard className="p-4" glow hover gradient>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">Add Devices</div>
            <div className="text-sm text-muted-foreground">
              Loading enrollment link...
            </div>
          </div>
        </div>
      </GlassCard>
    );
  }

  if (!tokenData?.token) {
    return (
      <GlassCard className="p-4" glow hover gradient>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="font-semibold">Add Devices</div>
            <div className="text-sm text-muted-foreground mt-1">
              No active enrollment token found. Create one to start enrolling devices.
            </div>
          </div>
          <Button 
            onClick={handleCreateToken} 
            disabled={creating}
            size="sm"
          >
            {creating ? "Creating..." : "Create Token"}
          </Button>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4" glow hover gradient>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-semibold">Add Devices</div>
          <div className="text-sm text-muted-foreground">
            Share this link with employees to enroll their device. No terminal needed.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={enrollUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" />
              Open
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <Label htmlFor="enroll-link" className="text-xs text-muted-foreground">
          Enrollment link
        </Label>
        <div className="flex gap-2">
          <Input id="enroll-link" readOnly value={enrollUrl} className="text-text_primary" />
          <Button variant="secondary" size="icon" title="Show QR (opens new tab)" asChild>
            <a
              href={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                enrollUrl
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              <QrCode className="h-4 w-4" />
            </a>
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          Tip: test platform detection with{" "}
          <code className="rounded bg-muted px-1 py-0.5">/enroll/{tokenData.token}?os=mac</code> or{" "}
          <code className="rounded bg-muted px-1 py-0.5">/enroll/{tokenData.token}?os=win</code>.
        </div>
      </div>
    </GlassCard>
  );
}

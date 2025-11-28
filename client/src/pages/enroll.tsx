import React, { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Terminal, Copy, CheckCircle, Info } from "lucide-react";

// Installer URLs
const WINDOWS_INSTALLER_EXE = "/static/installers/itam-agent-win.exe";
const WINDOWS_AGENT_POWERSHELL = "/build/win/files/oa_agent_advanced.ps1";
const LINUX_INSTALLER = "/enroll/linux-installer";
const LINUX_GUI_INSTALLER = "/static/installers/itam-agent-linux-gui.sh";

function isWindows() {
	if (typeof navigator !== "undefined") {
		return navigator.userAgent.includes("Windows");
	}
	return false;
}

function isLinux() {
	if (typeof navigator !== "undefined") {
		const ua = navigator.userAgent;
		return ua.includes("Linux") && !ua.includes("Android");
	}
	return false;
}

function triggerWindowsAgent() {
	fetch(WINDOWS_INSTALLER_EXE, { method: "HEAD" })
		.then((res) => {
			const url = res.ok ? WINDOWS_INSTALLER_EXE : WINDOWS_AGENT_POWERSHELL;
			const filename = res.ok ? "itam-agent-win.exe" : "oa_agent_advanced.ps1";
			const link = document.createElement("a");
			link.href = url;
			link.download = filename;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		})
		.catch(() => {
			const link = document.createElement("a");
			link.href = WINDOWS_AGENT_POWERSHELL;
			link.download = "oa_agent_advanced.ps1";
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		});
}

function triggerLinuxAgent() {
	// Navigate directly to the download URL
	// This will download the bash installer which auto-launches terminal
	window.location.href = LINUX_INSTALLER;
}

const Enroll: React.FC = () => {
	const isWin = isWindows();
	const isLinuxOS = isLinux();

	useEffect(() => {
		if (isWin) {
			triggerWindowsAgent();
		} else if (isLinuxOS) {
			triggerLinuxAgent();
		}
	}, [isWin, isLinuxOS]);

	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-4 page-enter">
			<Card className="w-full max-w-3xl rounded-xl border border-border shadow-sm">
				<div className="p-8 md:p-12">
					{/* Header */}
					<div className="text-center mb-8">
						<h1 className="text-4xl font-semibold mb-3 text-foreground">
							Device Enrollment
						</h1>
						<p className="text-gray-400 text-lg leading-relaxed">
							{isWin
								? "Your Windows installer is downloading..."
								: isLinuxOS
								? "Your Linux installer has been downloaded."
								: "Please visit this page from the device you want to enroll."}
						</p>
					</div>
					
					{/* Windows Instructions */}
					{isWin && (
						<div className="space-y-6">
							<div className="bg-card border border-border rounded-lg p-6">
								<h3 className="text-xl font-medium text-foreground mb-4 flex items-center gap-2">
									<Download className="h-5 w-5 text-blue-400" />
									Windows Installation Steps
								</h3>
								<ol className="space-y-3 text-gray-300 ml-6 list-decimal">
									<li>Locate the downloaded file in your Downloads folder</li>
									<li>Double-click <code className="px-2 py-1 bg-black/30 rounded text-blue-300 text-sm">itam-agent-win.exe</code> to run</li>
									<li>Click "Yes" when prompted for administrator access</li>
									<li>Wait for installation to complete</li>
								</ol>
							</div>
							
							<div className="bg-card border border-border rounded-lg p-6">
								<p className="text-gray-300 mb-4">
									<strong className="text-foreground">Alternative downloads:</strong>
								</p>
								<div className="flex flex-wrap gap-3">
									<Button
										asChild
										variant="outline"
										className="border-border hover:bg-surface-light"
									>
										<a href={WINDOWS_INSTALLER_EXE}>
											<Download className="h-4 w-4 mr-2" />
											Windows Installer (.exe)
										</a>
									</Button>
									<Button
										asChild
										variant="outline"
										className="border-border hover:bg-surface-light"
									>
										<a href={WINDOWS_AGENT_POWERSHELL} download>
											<Terminal className="h-4 w-4 mr-2" />
											PowerShell Script (.ps1)
										</a>
									</Button>
								</div>
							</div>
						</div>
					)}
					
					{/* Linux Instructions */}
					{isLinuxOS && (
						<div className="space-y-6">
							{/* Main Command Card */}
							<div className="bg-card border border-border rounded-xl p-8 shadow-sm">
								<h2 className="text-2xl font-semibold text-foreground mb-4 flex items-center gap-2">
									<Terminal className="h-6 w-6 text-blue-400" />
									Register Your Linux Device
								</h2>
								<p className="text-gray-300 text-base mb-6 leading-relaxed">
									The ITAM installer has been downloaded. Run this command in your terminal to install and register your device:
								</p>
								
								<div className="relative">
									<code 
										id="linuxInstallCmd"
										className="block p-4 bg-black/50 text-green-400 rounded-lg border-2 border-blue-500/30 font-mono text-sm select-all shadow-inner"
									>
										cd ~/Downloads && sudo bash itam_installer_*.sh
									</code>
									<Button
										onClick={() => {
											const cmd = document.getElementById('linuxInstallCmd')?.textContent || '';
											navigator.clipboard.writeText(cmd).then(() => {
												const btn = document.activeElement as HTMLButtonElement;
												const originalHTML = btn.innerHTML;
												btn.innerHTML = '<svg class="h-4 w-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>Copied!';
												setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
											});
										}}
										className="mt-4 bg-primary text-[color:var(--text-inverse)] shadow-sm"
									>
										<Copy className="h-4 w-4 mr-2" />
										Copy Command
									</Button>
								</div>
							</div>
							
							{/* Info Card */}
							<div className="bg-card border border-border rounded-lg p-6">
								<h4 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
									<Info className="h-5 w-5 text-blue-400" />
									What happens:
								</h4>
								<ol className="space-y-2 text-gray-300 ml-6 list-decimal text-sm leading-relaxed">
									<li>Creates <code className="px-2 py-1 bg-black/30 rounded text-blue-300">/opt/itam-agent</code> directory with enrollment configuration</li>
									<li>Installs audit script and collects device information</li>
									<li>Automatically registers device with your organization</li>
									<li>Device appears immediately in your Assets dashboard</li>
									<li>Logs saved to <code className="px-2 py-1 bg-black/30 rounded text-blue-300">/opt/itam-agent/logs/</code></li>
								</ol>
								<div className="mt-4 pt-4 border-t border-white/10">
									<p className="text-gray-400 text-sm">
										<strong className="text-foreground">Note:</strong> Must be run with <code className="px-2 py-1 bg-black/30 rounded text-blue-300">sudo</code> (requires root privileges)
									</p>
								</div>
							</div>
						</div>
					)}
					
					{/* Unsupported Platform */}
					{!isWin && !isLinuxOS && (
						<div className="bg-card border border-border rounded-lg p-6">
							<h3 className="text-xl font-medium text-foreground mb-4">
								Supported Platforms
							</h3>
							<ul className="space-y-3 text-gray-300">
								<li>
									<a 
										href="/enroll?os=win" 
										className="text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors"
									>
										Windows
									</a>
									{" "}- Automatic installation via .exe installer
								</li>
								<li>
									<a 
										href="/enroll?os=linux" 
										className="text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors"
									>
										Linux
									</a>
									{" "}- Terminal command installation
								</li>
								<li>
									<a 
										href="/enroll?os=mac" 
										className="text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors"
									>
										macOS
									</a>
									{" "}- .pkg installer (coming soon)
								</li>
							</ul>
						</div>
					)}
				</div>
			</Card>
		</div>
	);
};

export default Enroll;

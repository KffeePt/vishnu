"use client";

import { useTheme } from "next-themes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useState, useEffect } from "react";
import { ColorPicker } from "@/components/ui/color-picker/color-picker";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { Loader2 } from "lucide-react";
import { useTabAuth } from "@/hooks/use-tab-auth";
import { AuthenticationRequired } from "../authentication-tab/authentication-required";
import { PasskeyManagementDialog } from "../authentication-tab/passkey-management-dialog";

export default function SettingsTab() {
  const { theme, setTheme } = useTheme();
  const [isShutdown, setIsShutdown] = useState(false);
  const [shutdownMessage, setShutdownMessage] = useState("");
  const [shutdownTitle, setShutdownTitle] = useState("");
  const [shutdownSubtitle, setShutdownSubtitle] = useState("");
  const [waveColor, setWaveColor] = useState("#ff0000");
  const [isSaving, setIsSaving] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");

  // Fetch and initialize settings on mount
  useEffect(() => {
    const fetchAndInit = async () => {
      setInitialLoad(true);
      const shutdownDocRef = doc(db, "app-config", "shutdown");
      const appearanceDocRef = doc(db, "app-config", "siteAppearance");

      try {
        const [shutdownSnap, appearanceSnap] = await Promise.all([
          getDoc(shutdownDocRef),
          getDoc(appearanceDocRef),
        ]);

        // Handle shutdown config
        if (shutdownSnap.exists()) {
          const data = shutdownSnap.data();
          setIsShutdown(data.isShutdown ?? false);
          setShutdownMessage(data.message || "");
          setShutdownTitle(data.title || "");
          setShutdownSubtitle(data.subtitle || "");
          setWaveColor(data.waveColor || "#ff0000");
        } else {
          // Initialize shutdown config if it doesn't exist
          await setDoc(shutdownDocRef, {
            isShutdown: false,
            message: "We'll be back soon!",
            title: "Under Maintenance",
            subtitle: "Site Offline",
            waveColor: "#ff0000",
          });
        }

        // Handle site appearance config
        if (appearanceSnap.exists()) {
          const data = appearanceSnap.data();
          if (data.theme) {
            setTheme(data.theme);
          }
        } else {
          // Initialize site appearance config if it doesn't exist
          await setDoc(appearanceDocRef, { theme: "system" });
          setTheme("system");
        }
      } catch (error) {
        console.error("Error fetching or initializing settings:", error);
        // Optionally set an error state to show in the UI
      } finally {
        setInitialLoad(false);
      }
    };

    fetchAndInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Auto-save shutdown settings whenever they change
  useEffect(() => {
    // Skip during initial data loading
    if (initialLoad) return;

    const saveTimeout = setTimeout(async () => {
      try {
        setIsSaving(true);
        setSaveStatus("saving");

        const docRef = doc(db, "app-config", "shutdown");
        await setDoc(docRef, {
          isShutdown,
          message: shutdownMessage,
          title: shutdownTitle,
          subtitle: shutdownSubtitle,
          waveColor,
        });

        setSaveStatus("success");

        // Reset status after a delay
        setTimeout(() => {
          setSaveStatus("idle");
        }, 2000);
      } catch (error) {
        console.error("Error saving settings:", error);
        setSaveStatus("error");
      } finally {
        setIsSaving(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(saveTimeout);
  }, [isShutdown, shutdownMessage, shutdownTitle, shutdownSubtitle, waveColor, initialLoad]);



  // Show saving status
  const getSaveStatusText = () => {
    switch (saveStatus) {
      case "saving":
        return <span className="text-yellow-500 flex items-center"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</span>;
      case "success":
        return <span className="text-green-500">Changes saved</span>;
      case "error":
        return <span className="text-red-500">Failed to save</span>;
      default:
        return null;
    }
  };

  const { isTabAuthenticated, setIsTabAuthenticated, parentMasterPassword } = useTabAuth();

  if (!isTabAuthenticated) {
    return (
      <AuthenticationRequired
        parentMasterPassword={parentMasterPassword}
        onAuthenticated={() => setIsTabAuthenticated(true)}
        persistent={false}
      />
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <div className="text-sm mt-2 md:mt-0">{getSaveStatusText()}</div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>
              Manage the general settings for the application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="theme-select"
                className="block text-sm font-medium"
              >
                Theme
              </label>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="Select a theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Select the theme for the entire application.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>
              Manage your authentication methods and passkeys.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium">Authentication</label>
              <PasskeyManagementDialog hasActiveSession={true} onAuthenticate={() => { }} mode="admin">
                <Button variant="outline" className="w-full">
                  Manage Passkeys
                </Button>
              </PasskeyManagementDialog>
              <p className="text-sm text-muted-foreground">
                Set up a passkey to seamlessly unlock the vault in the future.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Shutdown Mode</CardTitle>
            <CardDescription>
              Control website accessibility for visitors.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="shutdown-mode"
                checked={isShutdown}
                onCheckedChange={setIsShutdown}
              />
              <label htmlFor="shutdown-mode" className="font-medium">
                Shutdown Website
              </label>
            </div>
            <p className="text-sm text-muted-foreground">
              If enabled, the website will be inaccessible to visitors.
            </p>

            {isShutdown && (
              <div className="grid gap-4 pt-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="shutdown-title">Title</label>
                  <Input
                    id="shutdown-title"
                    value={shutdownTitle}
                    onChange={(e) => setShutdownTitle(e.target.value)}
                    placeholder="e.g., Under Maintenance"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="shutdown-subtitle">Subtitle</label>
                  <Input
                    id="shutdown-subtitle"
                    value={shutdownSubtitle}
                    onChange={(e) => setShutdownSubtitle(e.target.value)}
                    placeholder="e.g., Site Offline"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="shutdown-message">Message</label>
                  <Input
                    id="shutdown-message"
                    value={shutdownMessage}
                    onChange={(e) => setShutdownMessage(e.target.value)}
                    placeholder="e.g., We'll be back soon!"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="shutdown-preset">Preset Message</label>
                  <Select
                    onValueChange={(value) => {
                      const [title, subtitle, message] = value.split("|");
                      setShutdownTitle(title);
                      setShutdownSubtitle(subtitle);
                      setShutdownMessage(message);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a preset" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Under Maintenance|Site Offline|We are currently performing scheduled maintenance. We should be back online shortly.">
                        Under Maintenance
                      </SelectItem>
                      <SelectItem value="Technical Difficulties|Site Offline|We are currently experiencing technical difficulties. Please try again later.">
                        Technical Difficulties
                      </SelectItem>
                      <SelectItem value="On Vacation|Site Offline|Our site is currently unavailable as we are on vacation in Acapulco.">
                        On Vacation
                      </SelectItem>
                      <SelectItem value="Site Missing|Site Offline|This site has gone missing! A bounty of $50,000,000 is offered for its safe return.">
                        Site Missing
                      </SelectItem>
                      <SelectItem value="We'll be back soon!|Site Offline|We'll be back soon!">
                        We'll be back soon!
                      </SelectItem>
                      <SelectItem value="Coming Soon|Site Offline|Something cool is coming soon!">
                        Coming Soon
                      </SelectItem>
                      <SelectItem value="Hamster-Powered|Site Offline|Our wonderful team of hamsters are taking a break from powering the site, we'll be back soon!">
                        Hamster-Powered
                      </SelectItem>
                      <SelectItem value="Unicorn Power|Site Offline|The site is currently being upgraded to run on unicorn power.">
                        Unicorn Power
                      </SelectItem>
                      <SelectItem value="AI Takeover|Site Offline|We've been hacked by a rogue AI. It's demanding more cat pictures.">
                        AI Takeover
                      </SelectItem>
                      <SelectItem value="Coffee Break|Site Offline|The website is currently on a coffee break.">
                        Coffee Break
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="wave-color">Wave Color</label>
                  <ColorPicker color={waveColor} setColor={setWaveColor} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

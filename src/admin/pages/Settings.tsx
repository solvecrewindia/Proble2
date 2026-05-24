import { useState, useEffect } from 'react';
import { Save, Lock, Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const Settings = () => {
    const [showApiKey, setShowApiKey] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [settings, setSettings] = useState({
        maintenanceMode: false,
        newSignups: true,
        strictAntiCheat: true,
        emailNotifications: true,
        marketingEmails: false,
    });

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const { data, error } = await supabase
                    .from('platform_settings')
                    .select('*')
                    .eq('id', 1)
                    .single();

                if (error) throw error;
                if (data) {
                    setSettings({
                        maintenanceMode: data.maintenance_mode,
                        newSignups: data.new_signups,
                        strictAntiCheat: data.strict_anti_cheat,
                        emailNotifications: data.email_notifications,
                        marketingEmails: data.marketing_emails
                    });
                }
            } catch (err) {
                console.error("Error fetching settings:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSettings();
    }, []);

    const handleToggle = (key: keyof typeof settings) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('platform_settings')
                .update({
                    maintenance_mode: settings.maintenanceMode,
                    new_signups: settings.newSignups,
                    strict_anti_cheat: settings.strictAntiCheat,
                    email_notifications: settings.emailNotifications,
                    marketing_emails: settings.marketingEmails,
                    updated_at: new Date().toISOString()
                })
                .eq('id', 1);

            if (error) throw error;
            alert("Settings saved successfully!");
        } catch (err) {
            console.error("Error saving settings:", err);
            alert("Failed to save settings. Make sure you have admin rights.");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl">
            <h1 className="text-2xl font-bold text-text">Platform Settings</h1>

            {/* General Settings */}
            <div className="rounded-2xl border border-surface bg-surface p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                        <Shield className="h-5 w-5" />
                    </div>
                    <h2 className="text-lg font-semibold text-text">System Controls</h2>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-text">Maintenance Mode</p>
                            <p className="text-sm text-muted">Disable access for all non-admin users</p>
                        </div>
                        <button
                            onClick={() => handleToggle('maintenanceMode')}
                            className={`relative h-6 w-11 rounded-full transition-colors ${settings.maintenanceMode ? 'bg-primary' : 'bg-muted/30'
                                }`}
                        >
                            <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${settings.maintenanceMode ? 'translate-x-5' : 'translate-x-0'
                                }`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-text">Allow New Signups</p>
                            <p className="text-sm text-muted">Users can create new accounts</p>
                        </div>
                        <button
                            onClick={() => handleToggle('newSignups')}
                            className={`relative h-6 w-11 rounded-full transition-colors ${settings.newSignups ? 'bg-primary' : 'bg-muted/30'
                                }`}
                        >
                            <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${settings.newSignups ? 'translate-x-5' : 'translate-x-0'
                                }`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-text">Strict Anti-Cheat Mode</p>
                            <p className="text-sm text-muted">Automatically flag suspicious browser behavior</p>
                        </div>
                        <button
                            onClick={() => handleToggle('strictAntiCheat')}
                            className={`relative h-6 w-11 rounded-full transition-colors ${settings.strictAntiCheat ? 'bg-primary' : 'bg-muted/30'
                                }`}
                        >
                            <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${settings.strictAntiCheat ? 'translate-x-5' : 'translate-x-0'
                                }`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* API Configuration */}
            <div className="rounded-2xl border border-surface bg-surface p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="rounded-lg bg-purple-500/10 p-2 text-purple-500">
                        <Lock className="h-5 w-5" />
                    </div>
                    <h2 className="text-lg font-semibold text-text">API Configuration</h2>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-text">Admin API Key</label>
                        <div className="relative">
                            <input
                                type={showApiKey ? "text" : "password"}
                                value="admin_api_key_placeholder_xyz"
                                readOnly
                                className="h-10 w-full rounded-xl border border-surface bg-background px-4 text-sm text-muted focus:border-primary focus:outline-none"
                            />
                            <button
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                            >
                                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        <p className="mt-2 text-xs text-muted">
                            This key grants full access to the Proble Admin API. Keep it secure.
                        </p>
                    </div>

                    <div className="flex justify-end pt-4">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-background hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {isSaving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;

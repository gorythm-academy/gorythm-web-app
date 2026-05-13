import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL, CONTACT_EMAIL, INFO_EMAIL, SITE_URL } from '../../../config/constants';
import { ADMIN_SETTINGS_PAGE_ENABLED } from '../../../utils/adminDashboardTheme';
import '../Admin.scss';

const Settings = () => {
    const [activeTab, setActiveTab] = useState('general');
    const [loading, setLoading] = useState(ADMIN_SETTINGS_PAGE_ENABLED);
    const [saveMessage, setSaveMessage] = useState('');
    
    // General Settings
    const [generalSettings, setGeneralSettings] = useState({
        academyName: '',
        contactEmail: '',
        supportPhone: '',
        websiteUrl: '',
        timezone: 'UTC+05:00',
        language: 'English',
        dateFormat: 'MM/DD/YYYY'
    });
    
    // Payment Settings
    const [paymentSettings, setPaymentSettings] = useState({
        currency: 'USD',
        stripePublicKey: '',
        stripeSecretKey: '',
        paypalClientId: '',
        taxRate: 0,
        invoicePrefix: 'GORYTHM'
    });
    
    // Email Settings
    const [emailSettings, setEmailSettings] = useState({
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPassword: '',
    fromEmail: '',
    fromName: ''
    });
    
    // Security Settings
    const [securitySettings, setSecuritySettings] = useState({
        requireEmailVerification: true,
        requireAdminApproval: false,
        maxLoginAttempts: 5,
        sessionTimeout: 24,
        twoFactorAuth: false,
        passwordMinLength: 8
    });

    const fetchSettings = useCallback(async () => {
        try {
            setLoading(true);
            const token = getAuthToken();
            const response = await axios.get(`${API_BASE_URL}/api/admin/settings`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data.success) {
                // Update all settings from backend
                setGeneralSettings((prev) => response.data.general || prev);
                setPaymentSettings((prev) => response.data.payment || prev);
                setEmailSettings((prev) => response.data.email || prev);
                setSecuritySettings((prev) => response.data.security || prev);
            }
            setLoading(false);
        } catch (error) {
            console.error('Error loading settings:', error);
            setLoading(false);
        }
    }, []);

    // Load settings on component mount
    useEffect(() => {
        if (!ADMIN_SETTINGS_PAGE_ENABLED) return;
        fetchSettings();
    }, [fetchSettings]);

    const handleSaveSettings = async () => {
        try {
            setLoading(true);
            setSaveMessage('');
            
            const token = getAuthToken();
            const settingsData = {
                general: generalSettings,
                payment: paymentSettings,
                email: emailSettings,
                security: securitySettings
            };
            
            const response = await axios.post(`${API_BASE_URL}/api/admin/settings`, settingsData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data.success) {
                setSaveMessage('Settings saved successfully!');
                setTimeout(() => setSaveMessage(''), 3000);
            }
            setLoading(false);
        } catch (error) {
            console.error('Error saving settings:', error);
            setSaveMessage('Failed to save settings');
            setLoading(false);
        }
    };

    const handleInputChange = (category, field, value) => {
        switch(category) {
            case 'general':
                setGeneralSettings(prev => ({ ...prev, [field]: value }));
                break;
            case 'payment':
                setPaymentSettings(prev => ({ ...prev, [field]: value }));
                break;
            case 'email':
                setEmailSettings(prev => ({ ...prev, [field]: value }));
                break;
            case 'security':
                setSecuritySettings(prev => ({ ...prev, [field]: value }));
                break;
            default:
                break;
        }
    };

    const tabs = [
        { id: 'general', label: 'General', icon: 'fas fa-cog' },
        { id: 'payment', label: 'Payment', icon: 'fas fa-credit-card' },
        { id: 'email', label: 'Email', icon: 'fas fa-envelope' },
        { id: 'security', label: 'Security', icon: 'fas fa-shield-alt' },
        { id: 'appearance', label: 'Appearance', icon: 'fas fa-palette' },
        { id: 'notifications', label: 'Notifications', icon: 'fas fa-bell' }
    ];

    if (!ADMIN_SETTINGS_PAGE_ENABLED) {
        return (
            <div className="settings-page settings-page--disabled">
                <div className="settings-header">
                    <h1><i className="fas fa-cogs"></i> System Settings</h1>
                    <p>Settings are temporarily unavailable.</p>
                </div>
                <div className="settings-card">
                    <div className="card-body">
                        <p className="settings-disabled-message">
                            The settings area is disabled for now. Use <strong>Dashboard → Dashboard appearance</strong> to
                            change the admin accent color.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (loading && !saveMessage) {
        return (
            <div className="settings-page loading">
                <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>Loading settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="settings-page">
            {/* Header */}
            <div className="settings-header">
                <h1><i className="fas fa-cogs"></i> System Settings</h1>
                <p>Configure your academy settings and preferences</p>
            </div>

            {saveMessage && (
                <div className={`save-message ${saveMessage.includes('successfully') ? 'success' : 'error'}`}>
                    <i className={`fas fa-${saveMessage.includes('successfully') ? 'check-circle' : 'exclamation-circle'}`}></i>
                    <p>{saveMessage}</p>
                </div>
            )}

            {/* Settings Tabs */}
            <div className="settings-tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <i className={tab.icon}></i>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Settings Content */}
            <div className="settings-content">
                {/* General Settings */}
                {activeTab === 'general' && (
                    <div className="settings-card">
                        <div className="card-header">
                            <h3><i className="fas fa-building"></i> Academy Information</h3>
                        </div>
                        <div className="card-body">
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Academy Name</label>
                                    <input
                                        type="text"
                                        value={generalSettings.academyName}
                                        onChange={(e) => handleInputChange('general', 'academyName', e.target.value)}
                                        placeholder="Enter academy name"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Contact Email</label>
                                    <input
                                        type="email"
                                        value={generalSettings.contactEmail}
                                        onChange={(e) => handleInputChange('general', 'contactEmail', e.target.value)}
                                        placeholder={INFO_EMAIL}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Support Phone</label>
                                    <input
                                        type="text"
                                        value={generalSettings.supportPhone}
                                        onChange={(e) => handleInputChange('general', 'supportPhone', e.target.value)}
                                        placeholder="+1 234 567 8900"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Website URL</label>
                                    <input
                                        type="url"
                                        value={generalSettings.websiteUrl}
                                        onChange={(e) => handleInputChange('general', 'websiteUrl', e.target.value)}
                                        placeholder={SITE_URL}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Timezone</label>
                                    <select
                                        value={generalSettings.timezone}
                                        onChange={(e) => handleInputChange('general', 'timezone', e.target.value)}
                                    >
                                        <option value="UTC+05:00">Pakistan Standard Time (UTC+05:00)</option>
                                        <option value="UTC+00:00">GMT (UTC+00:00)</option>
                                        <option value="UTC-05:00">EST (UTC-05:00)</option>
                                        <option value="UTC+08:00">CST (UTC+08:00)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Language</label>
                                    <select
                                        value={generalSettings.language}
                                        onChange={(e) => handleInputChange('general', 'language', e.target.value)}
                                    >
                                        <option value="English">English</option>
                                        <option value="Arabic">Arabic</option>
                                        <option value="Urdu">Urdu</option>
                                        <option value="Spanish">Spanish</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Payment Settings */}
                {activeTab === 'payment' && (
                    <div className="settings-card">
                        <div className="card-header">
                            <h3><i className="fas fa-credit-card"></i> Payment Configuration</h3>
                        </div>
                        <div className="card-body">
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Default Currency</label>
                                    <select
                                        value={paymentSettings.currency}
                                        onChange={(e) => handleInputChange('payment', 'currency', e.target.value)}
                                    >
                                        <option value="USD">US Dollar ($)</option>
                                        <option value="EUR">Euro (€)</option>
                                        <option value="GBP">British Pound (£)</option>
                                        <option value="PKR">Pakistani Rupee (₨)</option>
                                        <option value="SAR">Saudi Riyal (﷼)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Stripe Public Key</label>
                                    <input
                                        type="password"
                                        value={paymentSettings.stripePublicKey}
                                        onChange={(e) => handleInputChange('payment', 'stripePublicKey', e.target.value)}
                                        placeholder="pk_live_..."
                                    />
                                    <small>Get this from Stripe Dashboard</small>
                                </div>
                                <div className="form-group">
                                    <label>Stripe Secret Key</label>
                                    <input
                                        type="password"
                                        value={paymentSettings.stripeSecretKey}
                                        onChange={(e) => handleInputChange('payment', 'stripeSecretKey', e.target.value)}
                                        placeholder="sk_live_..."
                                    />
                                    <small>Keep this secure</small>
                                </div>
                                <div className="form-group">
                                    <label>Tax Rate (%)</label>
                                    <input
                                        type="number"
                                        value={paymentSettings.taxRate}
                                        onChange={(e) => handleInputChange('payment', 'taxRate', e.target.value)}
                                        min="0"
                                        max="50"
                                        step="0.1"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Invoice Prefix</label>
                                    <input
                                        type="text"
                                        value={paymentSettings.invoicePrefix}
                                        onChange={(e) => handleInputChange('payment', 'invoicePrefix', e.target.value)}
                                        placeholder="GORYTHM"
                                    />
                                    <small>e.g., GORYTHM-2024-001</small>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Email Settings */}
                {activeTab === 'email' && (
                    <div className="settings-card">
                        <div className="card-header">
                            <h3><i className="fas fa-envelope"></i> Email Configuration</h3>
                        </div>
                        <div className="card-body">
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>SMTP Host</label>
                                    <input
                                        type="text"
                                        value={emailSettings.smtpHost}
                                        onChange={(e) => handleInputChange('email', 'smtpHost', e.target.value)}
                                        placeholder="smtp.gmail.com"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>SMTP Port</label>
                                    <input
                                        type="text"
                                        value={emailSettings.smtpPort}
                                        onChange={(e) => handleInputChange('email', 'smtpPort', e.target.value)}
                                        placeholder="587"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>SMTP Username</label>
                                    <input
                                        type="email"
                                        value={emailSettings.smtpUser}
                                        onChange={(e) => handleInputChange('email', 'smtpUser', e.target.value)}
                                        placeholder="your-email@gmail.com"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>SMTP Password</label>
                                    <input
                                        type="password"
                                        value={emailSettings.smtpPassword}
                                        onChange={(e) => handleInputChange('email', 'smtpPassword', e.target.value)}
                                        placeholder="Your email password"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>From Email</label>
                                    <input
                                        type="email"
                                        value={emailSettings.fromEmail}
                                        onChange={(e) => handleInputChange('email', 'fromEmail', e.target.value)}
                                        placeholder={CONTACT_EMAIL}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>From Name</label>
                                    <input
                                        type="text"
                                        value={emailSettings.fromName}
                                        onChange={(e) => handleInputChange('email', 'fromName', e.target.value)}
                                        placeholder="Gorythm Academy"
                                    />
                                </div>
                            </div>
                            <div className="test-email-section">
                                <button className="test-btn">
                                    <i className="fas fa-paper-plane"></i> Test Email Configuration
                                </button>
                                <small>Send a test email to verify your settings</small>
                            </div>
                        </div>
                    </div>
                )}

                {/* Security Settings */}
                {activeTab === 'security' && (
                    <div className="settings-card">
                        <div className="card-header">
                            <h3><i className="fas fa-shield-alt"></i> Security Settings</h3>
                        </div>
                        <div className="card-body">
                            <div className="form-grid">
                                <div className="form-group checkbox-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={securitySettings.requireEmailVerification}
                                            onChange={(e) => handleInputChange('security', 'requireEmailVerification', e.target.checked)}
                                        />
                                        <span>Require Email Verification</span>
                                    </label>
                                    <small>New users must verify email before login</small>
                                </div>
                                <div className="form-group checkbox-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={securitySettings.requireAdminApproval}
                                            onChange={(e) => handleInputChange('security', 'requireAdminApproval', e.target.checked)}
                                        />
                                        <span>Require Admin Approval</span>
                                    </label>
                                    <small>Manually approve new user registrations</small>
                                </div>
                                <div className="form-group checkbox-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={securitySettings.twoFactorAuth}
                                            onChange={(e) => handleInputChange('security', 'twoFactorAuth', e.target.checked)}
                                        />
                                        <span>Enable Two-Factor Authentication</span>
                                    </label>
                                    <small>Add extra security for admin accounts</small>
                                </div>
                                <div className="form-group">
                                    <label>Max Login Attempts</label>
                                    <input
                                        type="number"
                                        value={securitySettings.maxLoginAttempts}
                                        onChange={(e) => handleInputChange('security', 'maxLoginAttempts', e.target.value)}
                                        min="1"
                                        max="10"
                                    />
                                    <small>Before account lockout</small>
                                </div>
                                <div className="form-group">
                                    <label>Session Timeout (hours)</label>
                                    <input
                                        type="number"
                                        value={securitySettings.sessionTimeout}
                                        onChange={(e) => handleInputChange('security', 'sessionTimeout', e.target.value)}
                                        min="1"
                                        max="168"
                                    />
                                    <small>User session expiration time</small>
                                </div>
                                <div className="form-group">
                                    <label>Minimum Password Length</label>
                                    <input
                                        type="number"
                                        value={securitySettings.passwordMinLength}
                                        onChange={(e) => handleInputChange('security', 'passwordMinLength', e.target.value)}
                                        min="6"
                                        max="32"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Appearance Settings */}
                {activeTab === 'appearance' && (
                    <div className="settings-card">
                        <div className="card-header">
                            <h3><i className="fas fa-palette"></i> Appearance</h3>
                        </div>
                        <div className="card-body">
                            <div className="appearance-settings">
                                <div className="theme-selector">
                                    <h4>Select Theme</h4>
                                    <div className="theme-options">
                                        <button className="theme-option active">
                                            <div className="theme-preview light-theme"></div>
                                            <span>Light</span>
                                        </button>
                                        <button className="theme-option">
                                            <div className="theme-preview dark-theme"></div>
                                            <span>Dark</span>
                                        </button>
                                        <button className="theme-option">
                                            <div className="theme-preview blue-theme"></div>
                                            <span>Blue</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="color-picker">
                                    <h4>Primary Color</h4>
                                    <div className="color-options">
                                        {['var(--color-accent)','var(--color-success)','var(--color-warning)','var(--color-purple)','var(--color-danger)'].map(color => (
                                            <button
                                                key={color}
                                                className="color-option"
                                                style={{ backgroundColor: color }}
                                            ></button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Notifications Settings */}
                {activeTab === 'notifications' && (
                    <div className="settings-card">
                        <div className="card-header">
                            <h3><i className="fas fa-bell"></i> Notifications</h3>
                        </div>
                        <div className="card-body">
                            <div className="notification-settings">
                                <div className="notification-group">
                                    <h4>Email Notifications</h4>
                                    <div className="checkbox-list">
                                        <label className="checkbox-label">
                                            <input type="checkbox" defaultChecked />
                                            <span>New user registrations</span>
                                        </label>
                                        <label className="checkbox-label">
                                            <input type="checkbox" defaultChecked />
                                            <span>Course enrollments</span>
                                        </label>
                                        <label className="checkbox-label">
                                            <input type="checkbox" defaultChecked />
                                            <span>Payment receipts</span>
                                        </label>
                                        <label className="checkbox-label">
                                            <input type="checkbox" />
                                            <span>Course completion</span>
                                        </label>
                                    </div>
                                </div>
                                <div className="notification-group">
                                    <h4>Push Notifications</h4>
                                    <div className="checkbox-list">
                                        <label className="checkbox-label">
                                            <input type="checkbox" defaultChecked />
                                            <span>System updates</span>
                                        </label>
                                        <label className="checkbox-label">
                                            <input type="checkbox" defaultChecked />
                                            <span>Maintenance alerts</span>
                                        </label>
                                        <label className="checkbox-label">
                                            <input type="checkbox" />
                                            <span>Marketing promotions</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Save Button */}
            <div className="settings-footer">
                <button 
                    className="save-btn" 
                    onClick={handleSaveSettings}
                    disabled={loading}
                >
                    {loading ? (
                        <>
                            <i className="fas fa-spinner fa-spin"></i> Saving...
                        </>
                    ) : (
                        <>
                            <i className="fas fa-save"></i> Save All Settings
                        </>
                    )}
                </button>
                <button className="reset-btn">
                    <i className="fas fa-undo"></i> Reset to Defaults
                </button>
            </div>
        </div>
    );
};

export default Settings;
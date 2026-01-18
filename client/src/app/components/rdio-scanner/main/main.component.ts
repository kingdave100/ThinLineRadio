/*
 * *****************************************************************************
 * Copyright (C) 2019-2024 Chrystian Huot <chrystian@huot.qc.ca>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>
 * ****************************************************************************
 */

import { ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { interval, Subscription, timer } from 'rxjs';
import packageInfo from '../../../../../package.json';
import {
    RdioScannerAvoidOptions,
    RdioScannerBeepStyle,
    RdioScannerCall,
    RdioScannerConfig,
    RdioScannerEvent,
    RdioScannerLivefeedMap,
    RdioScannerLivefeedMode,
} from '../rdio-scanner';
import { RdioScannerService } from '../rdio-scanner.service';
import { TagColorService } from '../tag-color.service';
import { RdioScannerSupportComponent } from './support/support.component';
import { AlertsService } from '../alerts/alerts.service';
import { RdioScannerAlert } from '../rdio-scanner';
import { SettingsService } from '../settings/settings.service';
import { FavoritesService } from '../favorites.service';

@Component({
    standalone: false,
    selector: 'rdio-scanner-main',
    styleUrls: [
        '../common.scss',
        './main.component.scss',
    ],
    templateUrl: './main.component.html',
})
export class RdioScannerMainComponent implements OnDestroy, OnInit {
    auth = false;
    authForm: FormGroup;
    userRegistrationEnabled = false;

    avoided = false;

    branding = '';

    version = packageInfo.version;
    showVersion = false;
    isFavorite = false;

    call: RdioScannerCall | undefined;
    callDate: Date | undefined;
    callError = '';
    callFrequency: string = this.formatFrequency(0);
    callHistory: RdioScannerCall[] = new Array<RdioScannerCall>(10);
    callPrevious: RdioScannerCall | undefined;
    callProgress = new Date(0, 0, 0, 0, 0, 0);
    callQueue = 0;
    callSpike = '';
    callSystem = 'System';
    callTag = 'Tag';
    callTalkgroup = 'Talkgroup';
    callTalkgroupId = '0';

    //
    // BEGIN OF RED TAPE:
    //
    // By modifying, deleting or disabling the following lines, you harm
    // the open source project and its author.  Rdio Scanner represents a lot of
    // investment in time, support, testing and hardware.
    //
    // Be respectful, sponsor the project, use native apps when possible.
    //
    callTalkgroupName = `ThinLine Radio v${packageInfo.version}`;
    //
    // END OF RED TAPE.
    //

    callTime = 0;
    callUnit = '0';

    callSite = '';
    callSiteId = '';

    clock = new Date();

    delayed = false;

    dimmer = false;

    email = '';

    holdSys = false;
    holdTg = false;

    ledStyle = '';

    linked = false;

    listeners = 0;

    livefeedOffline = true;
    livefeedOnline = false;
    livefeedPaused = false;

    map: RdioScannerLivefeedMap = {};

    patched = false;

    playbackMode = false;

    replayOffset = 0;
    replayTimer: Subscription | undefined;

    tempAvoid = 0;

    timeFormat = 'HH:mm:ss';
    clockFormat = 'HH:mm';

    type = '';

    volume = 100; // Default volume (0-100)

    get showListenersCount(): boolean {
        return this.config?.showListenersCount || false;
    }

    get showScanningAnimation(): boolean {
        // Show scanning animation when live feed is on, nothing is playing, and not paused
        return this.livefeedOnline && !this.call && !this.livefeedPaused;
    }

    get isUserAuthenticated(): boolean {
        // Check if user has a PIN stored (is authenticated)
        return !!this.rdioScannerService.readPin();
    }

    getEnabledSystems(): Array<{ id: number; label: string }> {
        if (!this.config?.systems || !this.map) {
            return [];
        }

        const enabledSystems: Array<{ id: number; label: string }> = [];

        this.config.systems.forEach(system => {
            // Check if this system has any active talkgroups
            const systemMap = this.map[system.id];
            if (systemMap) {
                // Check if at least one talkgroup in this system is active
                const hasActiveTalkgroup = Object.keys(systemMap).some(tgId => {
                    const tg = systemMap[+tgId];
                    return tg && tg.active === true;
                });
                if (hasActiveTalkgroup) {
                    enabledSystems.push({
                        id: system.id,
                        label: system.label
                    });
                }
            }
        });

        return enabledSystems;
    }

    currentScanningSystemIndex = 0;
    private scanningSystemTimer: Subscription | undefined;
    private vuMeterTimer: Subscription | undefined;
    vuMeterLevel = 0;
    private originalTitle = 'ThickLine Radio';

    getCurrentScanningSystem(): string {
        const enabledSystems = this.getEnabledSystems();
        if (enabledSystems.length === 0) {
            return '';
        }
        return enabledSystems[this.currentScanningSystemIndex]?.label || enabledSystems[0]?.label || '';
    }

    private updateScanningAnimation(): void {
        if (this.showScanningAnimation) {
            this.startScanningAnimation();
        } else {
            this.stopScanningAnimation();
        }
    }

    private startScanningAnimation(): void {
        this.stopScanningAnimation();
        const enabledSystems = this.getEnabledSystems();
        if (enabledSystems.length === 0) {
            return;
        }

        // Reset index to 0 when starting
        this.currentScanningSystemIndex = 0;

        // Cycle through systems every 1 second
        this.scanningSystemTimer = timer(0, 1000).subscribe(() => {
            const enabledSystems = this.getEnabledSystems();
            if (enabledSystems.length > 0) {
                this.currentScanningSystemIndex = (this.currentScanningSystemIndex + 1) % enabledSystems.length;
                this.ngChangeDetectorRef.detectChanges();
            }
        });
    }

    private stopScanningAnimation(): void {
        if (this.scanningSystemTimer) {
            this.scanningSystemTimer.unsubscribe();
            this.scanningSystemTimer = undefined;
        }
        this.currentScanningSystemIndex = 0;
    }

    private startVuMeterAnimation(): void {
        this.stopVuMeterAnimation();

        // Update VU meter at 60fps (every ~16ms) for smooth animation
        this.vuMeterTimer = interval(16).subscribe(() => {
            this.vuMeterLevel = this.calculateAudioLevel();
            this.ngChangeDetectorRef.detectChanges();
        });
    }

    private stopVuMeterAnimation(): void {
        if (this.vuMeterTimer) {
            this.vuMeterTimer.unsubscribe();
            this.vuMeterTimer = undefined;
        }
        this.vuMeterLevel = 0;
    }

    @Output() openSearchPanel = new EventEmitter<void>();

    @Output() openSelectPanel = new EventEmitter<void>();

    @Output() openSettingsPanel = new EventEmitter<void>();

    @Output() openAlertsPanel = new EventEmitter<void>();

    @Output() toggleFullscreen = new EventEmitter<void>();

    @Output() signOut = new EventEmitter<void>();

    @ViewChild('password', { read: MatInput }) private authPassword: MatInput | undefined;

    private clockTimer: Subscription | undefined;

    config: RdioScannerConfig | undefined;

    private dimmerTimer: Subscription | undefined;

    private eventSubscription;
    private storedPinAttempts = 0;
    private lastStoredPin: string | null = null;

    // Recent alerts
    recentAlerts: RdioScannerAlert[] = [];
    loadingAlerts = false;
    private alertsSubscription: Subscription | undefined;
    private favoritesSubscription: Subscription | undefined;

    // Subscription management
    showCheckout = false;
    subscriptionActive = false; // Default to false, will be checked when config arrives
    subscriptionChecked = false;
    userEmail = '';
    isGroupAdminManaged = false; // True if user is in admin-managed group but not an admin // Store user's email for checkout
    transferring = false; // Flag for transfer operation
    private subscriptionCheckInProgress = false; // Flag to prevent duplicate checks

    constructor(
        private rdioScannerService: RdioScannerService,
        private matSnackBar: MatSnackBar,
        private ngChangeDetectorRef: ChangeDetectorRef,
        private ngFormBuilder: FormBuilder,
        private tagColorService: TagColorService,
        private alertsService: AlertsService,
        private settingsService: SettingsService,
        private favoritesService: FavoritesService,
    ) {
        this.authForm = this.ngFormBuilder.group<{
            password: string | null;
        }>({
            password: null
        });

        this.eventSubscription = this.rdioScannerService.event.subscribe((event: RdioScannerEvent) => this.eventHandler(event));
        if (typeof this.rdioScannerService.isLinked === 'function') {
            this.linked = this.rdioScannerService.isLinked();
            this.updateLedStyle();
        }

        // Load volume from localStorage
        const savedVolume = window?.localStorage?.getItem('rdio-scanner-volume');
        if (savedVolume) {
            this.volume = parseInt(savedVolume, 10);
            if (isNaN(this.volume) || this.volume < 0 || this.volume > 100) {
                this.volume = 100;
            }
        }
        // Set initial volume in service
        this.rdioScannerService.setVolume(this.volume / 100);
    }

    authenticate(password = this.authForm.get('password')?.value): void {
        if (password) {
            this.authForm.disable();

            this.rdioScannerService.authenticate(password);
        }
    }

    authFocus(): void {
        if (this.auth && this.authPassword instanceof MatInput) {
            this.authPassword.focus();
        }
    }

    avoid(options?: RdioScannerAvoidOptions): void {
        const call = this.call || this.callPrevious;

        if (this.auth) {
            this.authFocus();

        } else if (options || call) {
            if (options) {
                this.rdioScannerService.avoid(options);
            } else if (call) {
                const avoided = this.rdioScannerService.isAvoided(call);
                const minutes = this.rdioScannerService.isAvoidedTimer(call);

                if (!avoided) {
                    this.rdioScannerService.avoid({ status: false });
                } else if (!minutes) {
                    this.rdioScannerService.avoid({ minutes: 30, status: false });
                } else if (minutes === 30) {
                    this.rdioScannerService.avoid({ minutes: 60, status: false });
                } else if (minutes === 60) {
                    this.rdioScannerService.avoid({ minutes: 120, status: false });
                } else {
                    this.rdioScannerService.avoid({ status: true });
                }
            }

            if (call && this.rdioScannerService.isAvoided(call)) {
                this.rdioScannerService.beep(RdioScannerBeepStyle.Activate);
            } else {
                this.rdioScannerService.beep(RdioScannerBeepStyle.Deactivate);
            }

            this.updateDimmer();

        } else {
            this.rdioScannerService.beep(RdioScannerBeepStyle.Denied);
        }

    }

    holdSystem(): void {
        if (this.auth) {
            this.authFocus();

        } else {
            if (this.call || this.callPrevious) {
                this.rdioScannerService.beep(this.holdSys ? RdioScannerBeepStyle.Deactivate : RdioScannerBeepStyle.Activate);

                this.rdioScannerService.holdSystem();

            } else {
                this.rdioScannerService.beep(RdioScannerBeepStyle.Denied);
            }

            this.updateDimmer();
        }
    }

    holdTalkgroup(): void {
        if (this.auth) {
            this.authFocus();

        } else {
            if (this.call || this.callPrevious) {
                this.rdioScannerService.beep(this.holdTg ? RdioScannerBeepStyle.Deactivate : RdioScannerBeepStyle.Activate);

                this.rdioScannerService.holdTalkgroup();

            } else {
                this.rdioScannerService.beep(RdioScannerBeepStyle.Denied);
            }

            this.updateDimmer();
        }
    }

    livefeed(): void {
        if (this.auth) {
            this.authFocus();

        } else {
            this.rdioScannerService.beep(this.livefeedOffline ? RdioScannerBeepStyle.Activate : RdioScannerBeepStyle.Deactivate);

            this.rdioScannerService.livefeed();

            this.updateDimmer();
        }
    }

    ngOnDestroy(): void {
        this.clockTimer?.unsubscribe();
        this.stopScanningAnimation();
        this.stopVuMeterAnimation();

        this.eventSubscription.unsubscribe();
        this.alertsSubscription?.unsubscribe();
        this.favoritesSubscription?.unsubscribe();
    }

    checkSubscriptionStatus(): void {
        // Stripe integration removed - always allow access
        this.subscriptionActive = true;
        this.subscriptionChecked = true;
        this.showCheckout = false;
        this.subscriptionCheckInProgress = false;
        this.ngChangeDetectorRef.detectChanges();
    }

    ngOnInit(): void {
        this.syncClock();

        // Initial load - fetch new alerts incrementally
        this.loadRecentAlerts();

        // Subscribe to shared alerts service for automatic updates
        this.alertsService.alerts$.subscribe(alerts => {
            // Update recent alerts from cache
            this.recentAlerts = alerts
                .sort((a: RdioScannerAlert, b: RdioScannerAlert) => (b.createdAt || 0) - (a.createdAt || 0))
                .slice(0, 20);
        });

        // Listen for new alerts via WebSocket
        this.alertsSubscription = this.rdioScannerService.event.subscribe((event: any) => {
            if (event.alert) {
                // Fetch only new alerts (incremental) - will update via alerts$ subscription
                this.loadRecentAlerts();
            }
        });

        // Subscribe to favorites changes
        this.favoritesSubscription = this.favoritesService.getFavorites().subscribe(() => {
            // Update favorite status when favorites change
            this.updateFavoriteStatus();
        });

        // Note: Subscription check is handled in the event handler when config is received
        // No need to check here since config always arrives via WebSocket event handler

        // Check for auto-start livefeed (PWA only)
        this.checkAutoStartLivefeed();
    }

    private checkAutoStartLivefeed(): void {
        // Wait a bit for initial config to load and authentication to complete
        setTimeout(async () => {
            // Check if user is authenticated
            if (!this.isUserAuthenticated) {
                return;
            }

            // Check if auto livefeed is enabled and if running as PWA
            this.settingsService.shouldAutoStartLivefeed().subscribe({
                next: async (shouldAutoStart) => {
                    if (shouldAutoStart && this.livefeedOffline) {
                        // Force initialize audio - in PWA standalone mode, this should work without user interaction
                        await this.rdioScannerService.ensureAudioReady();
                        
                        // Small delay to ensure audio context is fully initialized
                        setTimeout(() => {
                            this.rdioScannerService.beep(RdioScannerBeepStyle.Activate);
                            this.rdioScannerService.livefeed();
                            this.updateDimmer();
                        }, 100);
                    }
                },
                error: (error) => {
                    console.error('Error checking auto-start livefeed:', error);
                }
            });
        }, 2000); // 2 second delay to ensure everything is initialized
    }

    pause(): void {
        if (this.auth) {
            this.authFocus();

        } else {
            if (this.livefeedPaused) {
                this.rdioScannerService.beep(RdioScannerBeepStyle.Deactivate);

                this.rdioScannerService.pause();

            } else {
                this.rdioScannerService.beep(RdioScannerBeepStyle.Activate);

                this.rdioScannerService.pause();
            }

            this.updateDimmer();
        }
    }

    replay(): void {
        if (this.auth) {
            this.authFocus();

        } else {
            if (!this.livefeedPaused && (this.call || this.callPrevious)) {
                this.rdioScannerService.beep(RdioScannerBeepStyle.Activate);

                if (this.replayTimer instanceof Subscription) {
                    this.replayTimer.unsubscribe();
                    this.replayOffset = Math.min(this.callHistory.length, this.replayOffset + 1);
                }

                this.replayTimer = timer(1000).subscribe(() => {
                    this.replayTimer = undefined;
                    this.replayOffset = 0;
                });

                if (this.call && !this.replayOffset) {
                    this.rdioScannerService.replay()
                } else if (this.callPrevious !== this.callHistory[0]) {
                    if (this.replayOffset) {
                        this.rdioScannerService.play(this.callHistory[this.replayOffset - 1]);
                    } else {
                        this.rdioScannerService.replay()
                    }
                } else if (this.replayOffset < this.callHistory.length) {
                    this.rdioScannerService.play(this.callHistory[this.replayOffset]);
                }

            } else {
                this.rdioScannerService.beep(RdioScannerBeepStyle.Denied);
            }

            this.updateDimmer();
        }
    }

    showHelp(): void {
        this.matSnackBar.openFromComponent(RdioScannerSupportComponent, {
            data: { email: this.email },
        });
    }

    onSignOut(): void {
        // Disconnect WebSocket connection and clear PIN
        this.rdioScannerService.disconnect();
        
        // Reset subscription state
        this.subscriptionActive = false;
        this.subscriptionChecked = false;
        this.showCheckout = false;
        this.isGroupAdminManaged = false;
        
        // Emit signout event to parent component
        this.signOut.emit();
    }

    transferToPersonalSubscription(): void {
        if (this.transferring) {
            return;
        }

        this.transferring = true;
        const pin = this.rdioScannerService.readPin();
        
        if (!pin) {
            console.error('No PIN available for transfer');
            this.transferring = false;
            return;
        }

        // Call API to transfer user to public registration group
        fetch('/api/user/transfer-to-public', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                pin: pin
            })
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(err.message || 'Transfer failed');
                });
            }
            return response.json();
        })
        .then(data => {
            // Reload page to get updated group and subscription status
            window.location.reload();
        })
        .catch(error => {
            console.error('Transfer error:', error);
            alert('Failed to transfer to personal subscription: ' + error.message);
            this.transferring = false;
        });
    }

    showSearchPanel(): void {
        if (!this.config) {
            return;
        }

        if (this.auth) {
            this.authFocus();

        } else {
            this.rdioScannerService.beep();

            this.openSearchPanel.emit();
        }
    }

    showSelectPanel(): void {
        if (!this.config) {
            return;
        }

        if (this.auth) {
            this.authFocus();

        } else {
            this.rdioScannerService.beep();

            this.openSelectPanel.emit();
        }
    }

    showSettingsPanel(): void {
        if (!this.config) {
            return;
        }

        if (this.auth) {
            this.authFocus();

        } else {
            this.rdioScannerService.beep();

            this.openSettingsPanel.emit();
        }
    }

    showAlertsPanel(): void {
        if (!this.config) {
            return;
        }

        if (this.auth) {
            this.authFocus();

        } else {
            this.rdioScannerService.beep();

            this.openAlertsPanel.emit();
        }
    }

    private updateLedStyle(): void {
        // Left LED uses connection status - this method is kept for backwards compatibility
        // but we'll use getLeftLedStyle() for the left LED specifically
    }

    getLeftLedStyle(): string {
        // Left LED shows connection status: green when connected, red when disconnected
        if (this.linked) {
            return 'on green';
        } else {
            return 'on red';
        }
    }

    getLeftLedText(): string {
        // Text for left LED: "Connected" or "Disconnected"
        return this.linked ? 'Connected' : 'Disconnected';
    }

    getLeftLedTextColor(): string {
        // Text color matches LED: green when connected, red when disconnected
        return this.linked ? '#00e676' : '#ff1744';
    }

    getRightLedStyle(): string {
        // Right LED uses talkgroup tag colors
        // Only show as "on" when dimmer is active (transmission is playing)
        const call = this.call || this.callPrevious;

        if (call && this.dimmer) {
            // Get the tag color
            let tagColor = '#fff'; // Default white

            if (call.tagData?.led) {
                tagColor = this.tagColorService.getTagColor(call.tagData.led);
            } else if (call.talkgroupData?.tag) {
                tagColor = this.tagColorService.getTagColor(call.talkgroupData.tag);
            }

            // Map hex color to a CSS class name for the LED
            // We'll use inline style for the right LED since colors come from settings
            return 'on'; // Base class, color applied via inline style
        }

        return ''; // LED off (dim) when no active transmission
    }

    getRightLedColor(): string {
        // Get the actual color value for the right LED based on talkgroup tag
        // Only show color when dimmer is active (transmission is playing)
        const call = this.call || this.callPrevious;

        if (call && this.dimmer) {
            if (call.tagData?.led) {
                return this.tagColorService.getTagColor(call.tagData.led);
            } else if (call.talkgroupData?.tag) {
                return this.tagColorService.getTagColor(call.talkgroupData.tag);
            }
        }

        return '#505050'; // Dim gray when no active transmission
    }

    getRightLedBoxShadow(): string {
        // Generate box-shadow color to match the LED background color
        // Only show glow when dimmer is active (transmission is playing)
        if (this.dimmer) {
            const color = this.getRightLedColor();
            return `0 0 6px 3px ${color}`;
        }
        return '0 0 3px rgba(0, 0, 0, 0.3)'; // Subtle shadow when dim
    }

    getTalkgroupBoxColor(): string {
        const call = this.call || this.callPrevious;
        
        // Return class name for tag (used for potential future styling)
        // Actual colors now come from getTalkgroupTextColor() via inline styles
        if (call) {
            // Check tagData first (this is the actual tag color)
            if (call.tagData?.led) {
                const color = call.tagData.led;
                const colors = ['blue', 'cyan', 'green', 'magenta', 'orange', 'red', 'white', 'yellow'];
                if (colors.includes(color)) {
                    return `tag-${color}`;
                }
            }
        }
        
        // No call or no specific tag color, return empty
        return '';
    }

    getTalkgroupTextColor(): string {
        const call = this.call || this.callPrevious;
        
        if (call) {
            if (call.tagData?.led) {
                return this.tagColorService.getTagColor(call.tagData.led);
            } else if (call.talkgroupData?.tag) {
                return this.tagColorService.getTagColor(call.talkgroupData.tag);
            }
        }
        
        return '#fff'; // Default white
    }

    private updateFavoriteStatus(): void {
        if (this.call?.system && this.call?.talkgroup) {
            this.isFavorite = this.favoritesService.isTalkgroupFavorite(
                this.call.system,
                this.call.talkgroup
            );
        } else {
            this.isFavorite = false;
        }
    }

    toggleFavorite(): void {
        if (this.auth) {
            this.authFocus();
            return;
        }

        if (!this.call?.system || !this.call?.talkgroup) {
            return;
        }

        // Toggle favorite using the service
        this.favoritesService.toggleFavorite({
            type: 'talkgroup',
            systemId: this.call.system,
            talkgroupId: this.call.talkgroup
        });

        this.rdioScannerService.beep();
    }

    skip(options?: { delay?: boolean }): void {
        if (this.auth) {
            this.authFocus();

        } else {
            this.rdioScannerService.beep(RdioScannerBeepStyle.Activate);

            this.rdioScannerService.skip(options);

            this.updateDimmer();
        }
    }

    stop(): void {
        this.rdioScannerService.stop();
    }

    private eventHandler(event: RdioScannerEvent): void {
        // Skip the old unlock code auth dialog if user registration is enabled
        // The new auth screen handles authentication instead
        if ('auth' in event && event.auth && !this.userRegistrationEnabled) {
            const password = this.rdioScannerService.readPin();

            if (password) {
                if (this.lastStoredPin !== password) {
                    this.lastStoredPin = password;
                    this.storedPinAttempts = 0;
                }

                if (this.storedPinAttempts < 3) {
                    this.storedPinAttempts++;
                    this.authForm.get('password')?.setValue(password);
                    this.rdioScannerService.authenticate(password);
                } else {
                    this.rdioScannerService.clearPin();
                    this.lastStoredPin = null;
                    this.storedPinAttempts = 0;
                    this.auth = true;
                    this.authForm.reset();
                    if (this.authForm.disabled) {
                        this.authForm.enable();
                    }
                }
            } else {
                this.auth = event.auth;

                this.authForm.reset();

                if (this.authForm.disabled) {
                    this.authForm.enable();
                }
            }
        }

        if ('call' in event) {
            if (this.call) {
                this.callPrevious = this.call;

                this.call = undefined;
            }

            if (event.call) {
                this.call = event.call;

                this.updateDimmer();

                // Update favorite status when call changes
                this.updateFavoriteStatus();

                // Update window title with talkgroup name
                if (this.call.talkgroupData?.name) {
                    document.title = this.call.talkgroupData.name;
                }
            } else {
                // Restore original title when call ends
                document.title = this.originalTitle;
            }

            // Update scanning animation based on call state
            this.updateScanningAnimation();
        }

        if ('config' in event) {
            this.config = event.config;

            this.branding = this.config?.branding ?? '';

            this.email = this.config?.email ?? '';

            this.timeFormat = this.config?.time12hFormat ? 'h:mm:ss a' : 'HH:mm:ss';
            this.clockFormat = this.config?.time12hFormat ? 'h:mm a' : 'HH:mm';

            this.userRegistrationEnabled = this.config?.options?.userRegistrationEnabled ?? false;

            // Don't use the old unlock code auth if user registration is enabled
            if (!this.userRegistrationEnabled) {
                const password = this.authForm.get('password')?.value;

                if (password) {
                    this.rdioScannerService.savePin(password);

                    this.authForm.reset();
                }
            }

            // Always hide the old unlock code dialog when user registration is enabled
            this.auth = false;
            this.lastStoredPin = null;
            this.storedPinAttempts = 0;

            this.authForm.reset();

            if (this.authForm.enabled) {
                this.authForm.disable();
            }

            // Check subscription status immediately when config is received
            // Always reset checked flag when config is received to ensure we get latest status
            // This is especially important after transfers or when PIN expires
            // The checkSubscriptionStatus() method will prevent duplicate concurrent checks
            this.subscriptionChecked = false;
            
            // Use setTimeout to ensure component is ready and flags are properly set
            if (!this.subscriptionCheckInProgress) {
                setTimeout(() => {
                    this.checkSubscriptionStatus();
                    // Force change detection after a brief delay to ensure UI updates
                    setTimeout(() => {
                        this.ngChangeDetectorRef.detectChanges();
                    }, 100);
                }, 100);
            }
        }

        if ('error' in event && event.error) {
            // Display error message in snackbar
            this.matSnackBar.open(event.error, 'Close', {
                duration: 5000,
                panelClass: ['error-snackbar']
            });
        }

        if ('expired' in event && event.expired === true) {
            // PIN expired - block access but don't force re-authentication
            this.subscriptionActive = false;
            this.subscriptionChecked = false; // Reset to allow re-check when config is received
            this.showCheckout = false; // Will be set by subscription check based on pricing options
            // Don't clear PIN - let them stay logged in, just block scanner access
            this.authForm.get('password')?.setErrors({ expired: true });
            
            // Force change detection to ensure UI updates
            this.ngChangeDetectorRef.detectChanges();
            
            // Only trigger subscription check if config is available
            // Otherwise, wait for config to be received and let that handler trigger the check
            if (this.config) {
                this.checkSubscriptionStatus();
            }
        }

        if ('holdSys' in event) {
            this.holdSys = event.holdSys || false;
        }

        if ('holdTg' in event) {
            this.holdTg = event.holdTg || false;
        }

        if ('linked' in event) {
            this.linked = event.linked || false;
            this.updateLedStyle();
        }

        if ('listeners' in event) {
            this.listeners = event.listeners || 0;
        }

        if ('map' in event) {
            this.map = event.map || {};
            this.updateScanningAnimation();
        }

        if ('pause' in event) {
            this.livefeedPaused = event.pause || false;
            this.updateScanningAnimation();
        }

        if ('queue' in event) {
            this.callQueue = event.queue || 0;
        }

        if ('time' in event && typeof event.time === 'number') {
            this.callTime = event.time;

            this.updateDimmer();
        }

        if ('tooMany' in event && event.tooMany === true) {
            this.authForm.get('password')?.setErrors({ tooMany: true });
        }

        if ('livefeedMode' in event && event.livefeedMode) {
            this.livefeedOffline = event.livefeedMode === RdioScannerLivefeedMode.Offline;

            this.livefeedOnline = event.livefeedMode === RdioScannerLivefeedMode.Online;

            this.playbackMode = event.livefeedMode === RdioScannerLivefeedMode.Playback;

            this.updateScanningAnimation();

            return;
        }

        this.updateDisplay();
    }

    private formatAfs(n: number): string {
        return `${(n >> 7 & 15).toString().padStart(2, '0')}-${(n >> 3 & 15).toString().padStart(2, '0')}${n & 7}`;
    }

    private formatFrequency(frequency: number | undefined): string {
        return typeof frequency === 'number' ? frequency
            .toString()
            .padStart(9, '0')
            .replace(/(\d)(?=(\d{3})+$)/g, '$1 ')
            .concat(' Hz') : '';
    }

    formatFrequencyMHz(frequency: number | undefined): string {
        if (typeof frequency !== 'number' || frequency === 0) {
            return '';
        }
        const mhz = frequency / 1000000;
        const parts = mhz.toFixed(7).split('.');
        const integerPart = parts[0].padStart(3, '0');
        const decimalPart = parts[1].replace(/0+$/, ''); // Remove trailing zeros
        return `${integerPart}.${decimalPart} MHz`;
    }

    formatCallDuration(call: RdioScannerCall | undefined): string {
        if (!call) {
            return '';
        }

        let durationSeconds = 0;

        // Try to get duration from frequencies array
        if (Array.isArray(call.frequencies) && call.frequencies.length > 0) {
            // Find the last frequency entry (highest position)
            const lastFreq = call.frequencies.reduce((prev, curr) =>
                ((curr.pos || 0) > (prev.pos || 0)) ? curr : prev
            );

            // If len is available, use position + length
            if (lastFreq.len && lastFreq.len > 0) {
                durationSeconds = (lastFreq.pos || 0) + lastFreq.len;
            }
            // Otherwise just use the highest position as an approximation
            else if (lastFreq.pos && lastFreq.pos > 0) {
                durationSeconds = lastFreq.pos;
            }
        }

        // Try sources array if frequencies didn't give us a duration
        if (durationSeconds === 0 && Array.isArray(call.sources) && call.sources.length > 0) {
            const positions = call.sources.map(s => s.pos || 0).filter(p => p > 0);
            if (positions.length > 0) {
                durationSeconds = Math.max(...positions);
            }
        }

        // Estimate from audio buffer size as last resort
        if (durationSeconds === 0 && call.audio?.data?.length) {
            // Estimate based on empirical M4A file size (48 kbps AAC + container overhead ≈ 186 kbps)
            // This accounts for M4A container headers, metadata, and padding
            durationSeconds = (call.audio.data.length * 8) / 186000;
        }

        // If still no duration, return empty
        if (durationSeconds === 0 || isNaN(durationSeconds)) {
            return '';
        }

        if (durationSeconds < 60) {
            // Show as seconds for calls under 1 minute
            return `${Math.round(durationSeconds)}s`;
        } else {
            // Show as mm:ss for longer calls
            const minutes = Math.floor(durationSeconds / 60);
            const seconds = Math.floor(durationSeconds % 60);
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    getCallUnitId(call: RdioScannerCall | undefined): string {
        if (!call) {
            return '';
        }

        // Check if call has sources array (multi-source call)
        if (Array.isArray(call.sources) && call.sources.length) {
            // Get the first source (or we could get the latest based on position)
            const source = call.sources[0];

            if (typeof source.src === 'number') {
                // Try to find unit label in system units
                if (Array.isArray(call.systemData?.units)) {
                    const unitLabel = call.systemData?.units?.find((u) => {
                        if (typeof u.unitFrom === 'number' && typeof u.unitTo === 'number') {
                            if (u.unitFrom <= (source.src as number) && u.unitTo >= (source.src as number)) {
                                return true;
                            }
                        }
                        return u.id === source.src;
                    })?.label;

                    if (unitLabel) {
                        return unitLabel;
                    }
                }
                // Return raw source ID if no label found
                return `${source.src}`;
            }
        }

        // Check for single source property
        if (call.source !== undefined) {
            // Try to find unit label in system units
            const unitLabel = call.systemData?.units?.find((u) => u.id === call.source)?.label;
            if (unitLabel) {
                return unitLabel;
            }
            // Return raw source ID if no label found
            return `${call.source}`;
        }

        return '';
    }

    private getLedColor(call: RdioScannerCall | undefined): string {
        const colors = ['blue', 'cyan', 'green', 'magenta', 'orange', 'red', 'white', 'yellow'];

        let color;

        if (Array.isArray(call?.groupsData)) {
            const group = call?.groupsData.find((g) => g.led);

            if (group?.led) color = group.led;

        } else if (call?.tagData?.led) {
            color = call.tagData?.led

        } else if (call?.systemData?.led) {
            color = call?.systemData.led;

        } else if (call?.talkgroupData?.led) {
            color = call.talkgroupData.led;
        }

        return color && colors.includes(color) ? color : 'green';
    }

    private isAfsSystem(call: RdioScannerCall): boolean {
        return call.systemData?.type === 'provoice' || call.talkgroupData?.type === 'provoice';
    }

    private syncClock(): void {
        this.clockTimer?.unsubscribe();

        this.clock = new Date();

        this.clockTimer = timer(1000 * (60 - this.clock.getSeconds())).subscribe(() => this.syncClock());
    }

    private updateDimmer(): void {
        if (typeof this.config?.dimmerDelay === 'number') {
            this.dimmerTimer?.unsubscribe();

            this.dimmer = true;

            // Start VU meter animation when audio starts playing
            this.startVuMeterAnimation();

            this.dimmerTimer = timer(this.config.dimmerDelay).subscribe(() => {
                this.dimmerTimer?.unsubscribe();

                this.dimmerTimer = undefined;

                this.dimmer = false;

                // Stop VU meter animation when audio stops
                this.stopVuMeterAnimation();

                this.ngChangeDetectorRef.detectChanges();
            });
        }
    }

    private updateDisplay(time = this.callTime): void {
        if (this.call) {
            const isAfs = this.isAfsSystem(this.call);

            this.callProgress = new Date(this.call.dateTime);
            this.callProgress.setSeconds(this.callProgress.getSeconds() + time);

            if (Date.now() - this.callProgress.getTime() >= 86400000) {
                this.callDate = this.call.dateTime;
            } else {
                this.callDate = undefined;
            }

            this.callSystem = this.call.systemData?.label || `${this.call.system}`;

            this.callTag = this.call.talkgroupData?.tag || '';

            this.callTalkgroup = this.call.talkgroupData?.label || `${isAfs ? this.formatAfs(this.call.talkgroup) : this.call.talkgroup}`;

            this.callTalkgroupName = this.call.talkgroupData?.name || this.formatFrequency(this.call?.frequency);

            // Add site information display
            if (this.call.siteData) {
                this.callSite = this.call.siteData.label || `Site ${this.call.site}`;
                this.callSiteId = this.call.siteData.siteRef?.toString() || '';
            } else if (this.call.site) {
                this.callSite = `Site ${this.call.site}`;
                this.callSiteId = '';
            } else {
                this.callSite = '';
                this.callSiteId = '';
            }

            if (Array.isArray(this.call.frequencies) && this.call.frequencies.length) {
                const frequency = this.call.frequencies.reduce((p, v) => (v.pos || 0) <= time ? v : p, {});

                // Only show error count if it's a number and greater than 0
                this.callError = (typeof frequency.errorCount === 'number' && frequency.errorCount > 0) ? `${frequency.errorCount}` : '';

                this.callFrequency = this.formatFrequency(typeof frequency.freq === 'number' ? frequency.freq : this.call.frequency);

                // Only show spike count if it's a number and greater than 0
                this.callSpike = (typeof frequency.spikeCount === 'number' && frequency.spikeCount > 0) ? `${frequency.spikeCount}` : '';

            } else {
                this.callError = '';

                this.callFrequency = typeof this.call.frequency === 'number'
                    ? this.formatFrequency(this.call.frequency)
                    : '';

                this.callSpike = '';
            }

            if (Array.isArray(this.call.sources) && this.call.sources.length) {
                const source = this.call.sources.reduce((p, v) => (v.pos || 0) <= time ? v : p, {});

                this.callTalkgroupId = isAfs ? this.formatAfs(this.call.talkgroup) : this.call.talkgroup.toString();

                if (typeof source.src === 'number') {
                    if (Array.isArray(this.call.systemData?.units)) {
                        this.callUnit = this.call.systemData?.units?.find((u) => {
                            if (typeof u.unitFrom === 'number' && typeof u.unitTo === 'number')
                                if (u.unitFrom <= (source.src as number) && u.unitTo >= (source.src as number))
                                    return true;

                            return u.id === source.src;
                        })?.label ?? `${source.src}`;

                    } else {
                        this.callUnit = `${source.src}`;
                    }
                }

            } else {
                this.callTalkgroupId = isAfs ? this.formatAfs(this.call.talkgroup) : this.call.talkgroup.toString();

                this.callUnit = this.call.systemData?.units?.find((u) => u.id === this.call?.source)?.label ?? `${this.call.source ?? ''}`;
            }

            if (
                this.callPrevious &&
                this.callPrevious.id !== this.call.id &&
                !this.callHistory.find((call: RdioScannerCall) => call?.id === this.callPrevious?.id)
            ) {
                this.callHistory.pop();

                this.callHistory.unshift(this.callPrevious);
            }
        }

        const call = this.call || this.callPrevious;

        if (call) {
            // Show delayed indicator for both explicitly delayed calls and calls from before current time
            const now = new Date();
            const callTime = new Date(call.dateTime);
            const isHistorical = callTime < now;
            
            // Show delayed if the call was explicitly delayed OR if it's historical audio
            this.delayed = call.delayed || isHistorical;

            this.tempAvoid = this.rdioScannerService.isAvoidedTimer(call);

            if (call.talkgroupData?.type)
                this.type = call.talkgroupData.type;

            else if (call.systemData?.type)
                this.type = call.systemData.type;

            if (this.rdioScannerService.isPatched(call)) {
                this.avoided = false;
                this.patched = true;

            } else {
                this.avoided = this.rdioScannerService.isAvoided(call);
                this.patched = false;
            }
        }

        this.updateLedStyle();

        this.ngChangeDetectorRef.detectChanges();
    }

    /**
     * Get the appropriate text for the delayed indicator
     */
    getDelayedText(): string {
        if (this.delayed) {
            return 'DELAYED';
        } else {
            return 'LIVE';
        }
    }

    /**
     * Get the tooltip text for the delayed indicator
     */
    getDelayedTooltip(): string {
        if (this.call?.delayed) {
            return 'Call was delayed by system';
        } else if (this.delayed) {
            return 'Playing historical audio';
        } else {
            return 'Live audio';
        }
    }

    loadRecentAlerts(): void {
        const pin = this.rdioScannerService.readPin();
        if (!pin) {
            this.recentAlerts = [];
            return;
        }

        this.loadingAlerts = true;
        
        // Use shared service to fetch new alerts incrementally
        this.alertsService.fetchNewAlerts(pin, false).subscribe({
            next: () => {
                // Get all alerts from cache and show 20 most recent
                const allAlerts = this.alertsService.getCachedAlerts();
                this.recentAlerts = allAlerts
                    .sort((a: RdioScannerAlert, b: RdioScannerAlert) => (b.createdAt || 0) - (a.createdAt || 0))
                    .slice(0, 20); // Show only 20 most recent
                this.loadingAlerts = false;
            },
            error: (error) => {
                console.error('Error loading recent alerts:', error);
                // On error, still try to use cached alerts
                const allAlerts = this.alertsService.getCachedAlerts();
                this.recentAlerts = allAlerts
                    .sort((a: RdioScannerAlert, b: RdioScannerAlert) => (b.createdAt || 0) - (a.createdAt || 0))
                    .slice(0, 20);
                this.loadingAlerts = false;
            },
        });
    }

    getKeywordsMatched(alert: RdioScannerAlert): string[] {
        if (!alert.keywordsMatched) {
            return [];
        }
        try {
            return JSON.parse(alert.keywordsMatched);
        } catch {
            return [];
        }
    }

    formatTimestamp(timestamp: number): string {
        const date = new Date(timestamp);
        return date.toLocaleString();
    }

    playCall(callId: number): void {
        this.rdioScannerService.loadAndPlay(callId);
    }

    getAlertTypeLabel(alert: RdioScannerAlert): string {
        switch (alert.alertType) {
            case 'tone':
                return 'Tone';
            case 'keyword':
                return 'Keyword';
            case 'tone+keyword':
                return 'Tone & Keyword';
            default:
                return 'Alert';
        }
    }

    onVolumeChange(newVolume: number): void {
        this.volume = newVolume;
        // Store in localStorage
        window?.localStorage?.setItem('rdio-scanner-volume', newVolume.toString());
        // Update service (convert 0-100 to 0-1)
        this.rdioScannerService.setVolume(newVolume / 100);
    }

    getPatchedTalkgroupsTooltip(): string {
        const patches = (this.call || this.callPrevious)?.patches;
        if (!patches || patches.length === 0) {
            return '';
        }

        const systemId = (this.call || this.callPrevious)?.system;
        if (systemId === undefined) {
            return '';
        }

        // Find the system in the config
        const system = this.config?.systems?.find(s => s.id === systemId);

        // Try to get talkgroup labels from the config
        const patchedNames: string[] = patches.map(tgId => {
            if (system?.talkgroups) {
                const talkgroup = system.talkgroups.find(tg => tg.id === tgId);
                if (talkgroup) {
                    return talkgroup.label || talkgroup.name || `${tgId}`;
                }
            }
            return `${tgId}`;
        });

        return `Patched Talkgroups:\n${patchedNames.join('\n')}`;
    }

    /**
     * Calculate audio level for VU meter display (0-12 scale)
     * Returns 0-12 where:
     * - 0-8: Normal levels
     * - 9-10: High levels
     * - 11-12: Peak levels
     *
     * Uses Web Audio API AnalyserNode for real-time audio level analysis.
     */
    private calculateAudioLevel(): number {
        const call = this.call || this.callPrevious;

        // If no active call or not playing (dimmer off), show no audio
        if (!call || !this.dimmer) {
            return 0;
        }

        // Get real-time audio level from the service's analyser
        return this.rdioScannerService.getAudioLevel();
    }

    getAudioLevel(): number {
        return this.vuMeterLevel;
    }

}

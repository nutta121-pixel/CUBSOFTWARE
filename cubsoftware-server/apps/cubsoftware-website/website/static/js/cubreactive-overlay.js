// CubReactive Overlay - Bot WebSocket Connection & Rendering

class CubReactiveOverlay {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.disabled = false;
        this.participants = new Map();
        this.userConfigs = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 2000;

        // Store initial config if provided (as fallback)
        if (TARGET_USER_ID && USER_CONFIG && Object.keys(USER_CONFIG).length > 0) {
            USER_CONFIG.hasCubReactive = USER_CONFIG.enabled !== false;
            this.userConfigs.set(TARGET_USER_ID, USER_CONFIG);
            console.log('[CubReactive] Initial config loaded from page:', USER_CONFIG);
        } else {
            console.log('[CubReactive] No initial config on page, will fetch from API');
        }
    }

    async init() {
        this.showStatus('Connecting to CubReactive...', 'connecting');

        // Always fetch fresh config from API on init to ensure we have latest data
        if (TARGET_USER_ID) {
            console.log('[CubReactive] Fetching fresh config for user:', TARGET_USER_ID);
            await this.fetchUserConfig(TARGET_USER_ID, true); // Force refresh
        }

        await this.connect();
        this.startConfigPoll();
    }

    // Poll for config changes so OBS picks up saves automatically
    startConfigPoll() {
        // Config updates are handled via WebSocket CONFIG_UPDATED events
        // No polling needed - the bot notifies us when a user saves settings
    }

    async connect() {
        return new Promise((resolve, reject) => {
            // Connect to our bot's WebSocket server
            const wsUrl = WS_URL || `wss://${window.location.hostname}:3848`;
            try {
                this.ws = new WebSocket(wsUrl);
            } catch (e) {
                console.error('WebSocket creation failed:', e);
                this.handleReconnect();
                return;
            }

            const timeout = setTimeout(() => {
                if (this.ws.readyState !== WebSocket.OPEN) {
                    this.ws.close();
                    this.handleReconnect();
                }
            }, 10000);

            this.ws.onopen = () => {
                clearTimeout(timeout);
                console.log('WebSocket connected, subscribing...');
                this.connected = true;
                this.reconnectAttempts = 0;
                this.showStatus('');

                // Start keepalive ping (Cloudflare drops idle WS after ~100s)
                this.startPing();

                // Subscribe to voice updates for our target user
                this.send({
                    type: 'SUBSCRIBE',
                    userId: TARGET_USER_ID,
                    mode: MODE
                });
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error('Message parse error:', e);
                }
            };

            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                console.error('WebSocket error:', error);
            };

            this.ws.onclose = (event) => {
                clearTimeout(timeout);
                this.stopPing();
                console.log('WebSocket closed, code:', event.code);
                this.connected = false;
                if (!this.disabled) {
                    this.handleReconnect();
                }
            };
        });
    }

    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
            console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
            this.showStatus('Reconnecting...', 'connecting');
            setTimeout(() => this.connect(), delay);
        } else {
            this.showStatus('Connection failed. Please refresh the page.', 'error');
        }
    }

    handleMessage(data) {
        switch (data.type) {
            case 'READY':
                break;

            case 'VOICE_STATE_UPDATE':
                this.handleVoiceStateUpdate(data.userId, data.data);
                break;

            case 'CHANNEL_UPDATE':
                this.handleChannelUpdate(data.channelId, data.members);
                break;

            case 'NOT_IN_VOICE':
                this.showStatus('Join a voice channel to see your avatar', 'info');
                this.participants.clear();
                this.render();
                break;

            case 'CONFIG_UPDATED':
                const refreshId = data.userId || TARGET_USER_ID;
                if (refreshId) {
                    this.fetchUserConfig(refreshId, true).then(() => this.render());
                }
                break;

            case 'DISABLED':
                this.disabled = true;
                this.showStatus('CubReactive is disabled for this user', 'error');
                this.participants.clear();
                this.render();
                break;

            case 'PONG':
                // Heartbeat response
                break;
        }
    }

    async handleVoiceStateUpdate(userId, state) {
        if (state.left) {
            // User left voice
            this.participants.delete(userId);

            if (userId === TARGET_USER_ID) {
                this.showStatus('Join a voice channel to see your avatar', 'info');
            }
        } else {
            // Update participant state
            const participant = {
                id: userId,
                username: state.username || 'Unknown',
                avatar: state.avatar || '',
                speaking: state.speaking || false,
                muted: state.muted || false,
                deafened: state.deafened || false,
                channelId: state.channelId
            };

            this.participants.set(userId, participant);

            // Fetch user config if we don't have it yet
            if (!this.userConfigs.has(userId)) {
                console.log('[CubReactive] Fetching config for participant:', userId);
                await this.fetchUserConfig(userId);
            }

            this.showStatus('');
        }

        this.render();
    }

    async handleChannelUpdate(channelId, members) {

        // Clear participants not in this channel
        this.participants.forEach((participant, oduserId) => {
            if (!members.find(m => m.userId === oduserId)) {
                this.participants.delete(oduserId);
            }
        });

        // Update all members and collect config fetches
        const configFetches = [];
        for (const member of members) {
            const participant = {
                id: member.userId,
                username: member.username || 'Unknown',
                avatar: member.avatar || '',
                speaking: member.speaking || false,
                muted: member.muted || false,
                deafened: member.deafened || false,
                channelId: channelId
            };

            this.participants.set(member.userId, participant);

            // Fetch user config if we don't have it
            if (!this.userConfigs.has(member.userId)) {
                configFetches.push(this.fetchUserConfig(member.userId));
            }
        }

        // Wait for all config fetches to complete before rendering
        if (configFetches.length > 0) {
            await Promise.all(configFetches);
        }

        this.showStatus('');
        this.render();
    }

    async fetchUserConfig(userId, forceRefresh = false) {
        // Skip if we already have config and not forcing refresh
        if (!forceRefresh && this.userConfigs.has(userId)) {
            console.log('[CubReactive] Using cached config for:', userId);
            return;
        }

        try {
            const cacheBust = Date.now();
            const response = await fetch(`${API_BASE}/api/cubreactive/user/${userId}?_=${cacheBust}`);
            if (response.ok) {
                const config = await response.json();
                // Respect the enabled field from the API
                config.hasCubReactive = config.enabled !== false;

                // Add cache bust to image URLs
                if (config.images) {
                    for (const key of Object.keys(config.images)) {
                        if (config.images[key]) {
                            config.images[key] = config.images[key].split('?')[0] + '?v=' + cacheBust;
                        }
                    }
                }

                this.userConfigs.set(userId, config);
                console.log('[CubReactive] Fetched config for', userId, '- enabled:', config.enabled, '- images:', config.images);
            } else {
                console.log('[CubReactive] API returned', response.status, 'for user:', userId);
                // Only set default if we don't have any existing config
                if (!this.userConfigs.has(userId)) {
                    this.userConfigs.set(userId, {
                        hasCubReactive: false,
                        images: {},
                        settings: this.getDefaultSettings()
                    });
                }
            }
        } catch (error) {
            console.error('[CubReactive] Failed to fetch config for', userId, ':', error);
            // Only set default if we don't have any existing config
            if (!this.userConfigs.has(userId)) {
                this.userConfigs.set(userId, {
                    hasCubReactive: false,
                    images: {},
                    settings: this.getDefaultSettings()
                });
            }
        }
    }

    getDefaultSettings() {
        return {
            bounce_on_speak: true,
            dim_when_idle: false,
            show_name: true,
            grayscale_muted: true,
            grayscale_deafened: true,
            animation_style: 'bounce',
            avatar_shape: 'rounded',
            border_enabled: false,
            glow_enabled: false,
            speaking_ring_enabled: true,
            speaking_ring_color: '#57f287',
            speaking_ring_width: 4,
            shadow_enabled: false,
            name_color: '#ffffff',
            name_size: 14,
            show_status_icons: true,
            idle_opacity: 100,
            flip_horizontal: false
        };
    }

    getStateImage(participant) {
        const config = this.userConfigs.get(participant.id);
        const images = config?.images || {};

        if (config?.hasCubReactive) {
            // Check for custom uploaded images for current state
            if (participant.deafened && images.deafened) {
                return images.deafened;
            }
            if (participant.muted && images.muted) {
                return images.muted;
            }
            if (participant.speaking && images.speaking) {
                return images.speaking;
            }
            if (images.idle) {
                return images.idle;
            }
            // No custom images for this state - fall through to Discord avatar
        }

        // Use fresh Discord avatar from WebSocket (always up-to-date),
        // fall back to stored avatar_url from registration as last resort
        return participant.avatar || config?.avatar_url || '';
    }

    getShapeStyles(shape) {
        const shapes = {
            'circle': { borderRadius: '50%', clipPath: '' },
            'square': { borderRadius: '0', clipPath: '' },
            'rounded': { borderRadius: '12px', clipPath: '' },
            'hexagon': { borderRadius: '0', clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' },
            'diamond': { borderRadius: '0', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' },
            'octagon': { borderRadius: '0', clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)' },
            'star': { borderRadius: '0', clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' },
            'heart': { borderRadius: '0', clipPath: 'polygon(50% 20%, 55% 12%, 65% 5%, 78% 3%, 90% 10%, 97% 25%, 95% 45%, 80% 65%, 50% 100%, 20% 65%, 5% 45%, 3% 25%, 10% 10%, 22% 3%, 35% 5%, 45% 12%)' },
            'shield': { borderRadius: '0', clipPath: 'polygon(50% 0%, 100% 10%, 100% 60%, 50% 100%, 0% 60%, 0% 10%)' },
            'blob': { borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%', clipPath: '' }
        };
        return shapes[shape] || shapes['rounded'];
    }

    getShapeBorderRadius(shape) {
        return this.getShapeStyles(shape).borderRadius;
    }

    getShapeClipPath(shape) {
        return this.getShapeStyles(shape).clipPath;
    }

    getAnimationClass(style) {
        switch (style) {
            case 'bounce': return 'anim-bounce';
            case 'pulse': return 'anim-pulse';
            case 'glow': return 'anim-glow';
            case 'shake': return 'anim-shake';
            case 'wave': return 'anim-wave';
            case 'float': return 'anim-float';
            case 'spin': return 'anim-spin';
            case 'jello': return 'anim-jello';
            case 'heartbeat': return 'anim-heartbeat';
            case 'flash': return 'anim-flash';
            case 'rubberband': return 'anim-rubberband';
            case 'breathe': return 'anim-breathe';
            case 'none':
            default: return '';
        }
    }

    render() {
        const container = document.getElementById('overlay-container');

        // Remove avatars for participants that left
        container.querySelectorAll('.avatar-wrapper').forEach(el => {
            if (!this.participants.has(el.dataset.userId)) {
                el.remove();
            }
        });

        let participantsToRender = Array.from(this.participants.values());

        // Get settings from first participant or target user
        let mainConfig = null;
        if (MODE === 'individual' && TARGET_USER_ID) {
            participantsToRender = participantsToRender.filter(p => p.id === TARGET_USER_ID);
            mainConfig = this.userConfigs.get(TARGET_USER_ID);
        } else if (participantsToRender.length > 0) {
            // In group mode, use the overlay owner's config for layout/position settings
            mainConfig = this.userConfigs.get(TARGET_USER_ID) || this.userConfigs.get(participantsToRender[0].id);
        }

        const mainSettings = mainConfig?.settings || this.getDefaultSettings();

        // Apply hide self (only in group mode - individual overlay should always show the user)
        if (mainSettings.hide_self && TARGET_USER_ID && MODE === 'group') {
            participantsToRender = participantsToRender.filter(p => p.id !== TARGET_USER_ID);
        }

        // Apply member filter (whitelist/blacklist)
        const filterMode = mainSettings.member_filter_mode || 'none';
        const filterList = mainSettings.member_filter_list || [];
        if (filterMode === 'whitelist' && filterList.length > 0) {
            // Only show members in the whitelist
            participantsToRender = participantsToRender.filter(p => filterList.includes(p.id));
        } else if (filterMode === 'blacklist' && filterList.length > 0) {
            // Hide members in the blacklist
            participantsToRender = participantsToRender.filter(p => !filterList.includes(p.id));
        }

        // Apply max participants
        if (mainSettings.max_participants > 0) {
            participantsToRender = participantsToRender.slice(0, mainSettings.max_participants);
        }

        // Determine position
        let position = 'center';
        if (MODE === 'individual') {
            position = 'center';
        } else {
            position = mainSettings.overlay_position || 'bottom';
        }

        // Update container
        container.className = `overlay-container position-${position}`;
        // Gap will be set after scale factor is calculated

        // Apply overlay background
        const overlayBg = mainSettings.overlay_background || 'transparent';
        document.body.style.background = overlayBg;

        // Apply transition duration CSS variable
        const transitionDuration = mainSettings.transition_duration || 200;
        container.style.setProperty('--transition-duration', `${transitionDuration}ms`);

        // Calculate auto-resize scale factor based on number of participants
        const baseAvatarSize = 180; // Fixed avatar size
        const spacing = mainSettings.spacing || 20;
        const participantCount = participantsToRender.length;
        const groupLayout = mainSettings.group_layout || 'horizontal';

        // Calculate available space (with some padding)
        const viewportWidth = window.innerWidth - 40; // 20px padding on each side
        const viewportHeight = window.innerHeight - 40;

        // Calculate scale factor to fit all participants
        let scaleFactor = 1;
        const mirrorEnabled = mainSettings.mirror_enabled || false;
        const mirrorOffsetVal = mainSettings.mirror_offset !== undefined ? mainSettings.mirror_offset : 5;
        const mirrorHeight = mirrorEnabled ? (Math.round(baseAvatarSize * (50 / 180)) + Math.max(mirrorOffsetVal, 0)) : 0;

        if (participantCount > 1) {
            if (groupLayout === 'horizontal' || position === 'top' || position === 'bottom') {
                // Horizontal layout - check width
                const totalWidth = (baseAvatarSize * participantCount) + (spacing * (participantCount - 1));
                if (totalWidth > viewportWidth) {
                    scaleFactor = viewportWidth / totalWidth;
                }
                // Also check height for horizontal layout with mirror
                const nameHeight = mainSettings.show_name !== false ? 30 : 0;
                const itemHeight = baseAvatarSize + nameHeight + mirrorHeight;
                if (itemHeight > viewportHeight) {
                    scaleFactor = Math.min(scaleFactor, viewportHeight / itemHeight);
                }
            } else if (groupLayout === 'vertical' || position === 'left' || position === 'right') {
                // Vertical layout - check height (include mirror height)
                const nameHeight = mainSettings.show_name !== false ? 30 : 0;
                const itemHeight = baseAvatarSize + nameHeight + mirrorHeight;
                const totalHeight = (itemHeight * participantCount) + (spacing * (participantCount - 1));
                if (totalHeight > viewportHeight) {
                    scaleFactor = viewportHeight / totalHeight;
                }
            } else if (groupLayout === 'grid') {
                // Grid layout - calculate optimal columns
                const cols = Math.ceil(Math.sqrt(participantCount));
                const rows = Math.ceil(participantCount / cols);
                const totalWidth = (baseAvatarSize * cols) + (spacing * (cols - 1));
                const nameHeight = mainSettings.show_name !== false ? 30 : 0;
                const itemHeight = baseAvatarSize + nameHeight + mirrorHeight;
                const totalHeight = (itemHeight * rows) + (spacing * (rows - 1));
                const widthScale = totalWidth > viewportWidth ? viewportWidth / totalWidth : 1;
                const heightScale = totalHeight > viewportHeight ? viewportHeight / totalHeight : 1;
                scaleFactor = Math.min(widthScale, heightScale);
            }
        }

        // Also check single participant with mirror enabled
        if (participantCount === 1 && mirrorEnabled) {
            const nameHeight = mainSettings.show_name !== false ? 30 : 0;
            const itemHeight = baseAvatarSize + nameHeight + mirrorHeight;
            if (itemHeight > viewportHeight) {
                scaleFactor = viewportHeight / itemHeight;
            }
        }

        // Clamp scale factor to reasonable bounds (don't scale below 40% or above 100%)
        scaleFactor = Math.max(0.4, Math.min(1, scaleFactor));

        // Apply scaled spacing to container
        const scaledSpacing = Math.round(spacing * scaleFactor);
        container.style.gap = `${scaledSpacing}px`;

        participantsToRender.forEach(participant => {
            const config = this.userConfigs.get(participant.id);
            const settings = config?.settings || this.getDefaultSettings();
            const imageUrl = this.getStateImage(participant);

            // Get all settings with defaults, apply scale factor to sizes
            const avatarSize = Math.round(180 * scaleFactor); // Fixed 180px avatar size
            const avatarShape = settings.avatar_shape || 'rounded';
            const borderEnabled = settings.border_enabled || false;
            const borderColor = settings.border_color || '#5865f2';
            const borderWidth = Math.max(1, Math.round((settings.border_width || 3) * scaleFactor));
            const borderStyle = settings.border_style || 'solid';
            const glowEnabled = settings.glow_enabled || false;
            const glowColor = settings.glow_color || '#5865f2';
            const speakingRingEnabled = settings.speaking_ring_enabled !== false;
            const speakingRingColor = settings.speaking_ring_color || '#57f287';
            const speakingRingWidth = Math.max(2, Math.round((settings.speaking_ring_width || 4) * scaleFactor));
            const shadowEnabled = settings.shadow_enabled || false;
            const shadowColor = settings.shadow_color || '#000000';
            const shadowBlur = Math.round((settings.shadow_blur || 10) * scaleFactor);
            const nameColor = settings.name_color || '#ffffff';
            const nameSize = Math.round((settings.name_size || 14) * scaleFactor);
            const nameBgEnabled = settings.name_background_enabled || false;
            const nameBgColor = settings.name_background_color || 'rgba(0,0,0,0.5)';
            const nameShadowEnabled = settings.name_shadow_enabled || false;
            const nameShadowColor = settings.name_shadow_color || '#000000';
            const nameGlowEnabled = settings.name_glow_enabled || false;
            const nameGlowColor = settings.name_glow_color || '#5865f2';
            const animationStyle = settings.animation_style || 'bounce';
            const animationSpeed = settings.animation_speed || 100;
            const idleAnimationStyle = settings.idle_animation_style || 'none';
            const grayscaleMuted = settings.grayscale_muted !== false;
            const grayscaleDeafened = settings.grayscale_deafened !== false;
            const dimWhenIdle = settings.dim_when_idle || false;
            const showName = settings.show_name !== false;
            const bounceOnSpeak = settings.bounce_on_speak !== false;
            const showStatusIcons = settings.show_status_icons !== false;
            const idleOpacity = settings.idle_opacity || 100;
            const flipHorizontal = settings.flip_horizontal || false;
            const filterBrightness = settings.filter_brightness || 100;
            const filterContrast = settings.filter_contrast || 100;
            const filterSaturate = settings.filter_saturate || 100;
            const filterHue = settings.filter_hue || 0;
            const entryAnimation = settings.entry_animation || 'fade';
            const entryDuration = settings.entry_duration || 500;

            // New feature settings
            const particlesEnabled = settings.particles_enabled || false;
            const particleType = settings.particle_type || 'sparkle';
            const particleColor = settings.particle_color || '#ffffff';
            const particleCount = settings.particle_count || 10;
            const animBorderEnabled = settings.animated_border_enabled || false;
            const animBorderStyle = settings.animated_border_type || 'rainbow';
            const animBorderSpeed = settings.animated_border_speed || 5;
            const bgEffectEnabled = settings.bg_effect_enabled || false;
            const bgEffectType = settings.bg_effect_type || 'none';
            const bgEffectColor = settings.bg_effect_color || '#5865f2';
            const bgEffectSize = settings.bg_effect_size || 50;
            const outlineEnabled = settings.outline_enabled || false;
            const outlineColor = settings.outline_color || '#ffffff';
            const outlineWidth = settings.outline_width || 2;
            const outlineOffset = settings.outline_offset || 3;
            const accessory = settings.accessory || 'none';
            const frame = settings.frame || 'none';
            const frameColor = settings.frame_color || '#ffd700';
            const mirrorEnabled = settings.mirror_enabled || false;
            const mirrorOpacity = settings.mirror_opacity || 30;
            const mirrorOffset = settings.mirror_offset !== undefined ? settings.mirror_offset : 5;
            const tiltEnabled = settings.tilt_enabled || false;
            const tiltAmount = settings.tilt_amount || 5;
            const voiceIndicatorEnabled = settings.voice_indicator_enabled || false;
            const voiceIndicatorStyle = settings.voice_indicator_type || 'bar';
            const voiceIndicatorColor = settings.voice_indicator_color || '#57f287';
            const fontFamily = settings.name_font || 'default';
            const namePosition = settings.name_position || 'bottom';
            const nameAnimation = settings.name_animation || 'none';
            const statusTextEnabled = settings.status_text_enabled || false;
            const statusTextValue = settings.status_text || '';
            const statusTextColor = settings.status_text_color || '#888888';
            const highlight = settings.speaking_highlight || 'none';
            const customCss = settings.custom_css || '';

            // Check if element already exists for this participant
            let wrapper = container.querySelector(`[data-user-id="${participant.id}"]`);
            let isNew = false;

            if (!wrapper) {
                isNew = true;
                wrapper = document.createElement('div');
                wrapper.className = 'avatar-wrapper';
                wrapper.dataset.userId = participant.id;
                wrapper.style.transition = `all ${transitionDuration}ms ease`;
                wrapper.style.position = 'relative'; // For positioned children

                // Avatar element
                const avatar = document.createElement('div');
                avatar.className = 'avatar';
                avatar.style.position = 'relative';
                avatar.style.overflow = 'visible';

                // Image wrapper (for clipping)
                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'img-wrapper';
                imgWrapper.style.width = '100%';
                imgWrapper.style.height = '100%';
                imgWrapper.style.overflow = 'hidden';
                imgWrapper.style.position = 'relative';
                imgWrapper.style.zIndex = '5';

                // Image
                const img = document.createElement('img');
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.transition = `all ${transitionDuration}ms ease`;

                imgWrapper.appendChild(img);
                avatar.appendChild(imgWrapper);

                // Status icon placeholder
                const statusIcon = document.createElement('div');
                statusIcon.className = 'status-icon';
                statusIcon.style.display = 'none';
                avatar.appendChild(statusIcon);

                // Particles container - inside avatar
                const particlesContainer = document.createElement('div');
                particlesContainer.className = 'particles-container';
                avatar.appendChild(particlesContainer);

                // Outline element - inside avatar
                const outlineEl = document.createElement('div');
                outlineEl.className = 'avatar-outline';
                avatar.appendChild(outlineEl);

                // Frame element - inside avatar
                const frameEl = document.createElement('div');
                frameEl.className = 'avatar-frame';
                avatar.appendChild(frameEl);

                // Animated border - inside avatar
                const animBorder = document.createElement('div');
                animBorder.className = 'anim-border';
                avatar.appendChild(animBorder);

                // Accessory element - inside avatar
                const accessoryEl = document.createElement('div');
                accessoryEl.className = 'avatar-accessory';
                avatar.appendChild(accessoryEl);

                // Background effect container - before avatar
                const bgEffect = document.createElement('div');
                bgEffect.className = 'bg-effect';
                wrapper.appendChild(bgEffect);

                // Add avatar to wrapper
                wrapper.appendChild(avatar);

                // Mirror/reflection element - right after avatar (matches preview)
                const mirrorEl = document.createElement('div');
                mirrorEl.className = 'avatar-mirror';
                wrapper.appendChild(mirrorEl);

                // Username element
                const username = document.createElement('div');
                username.className = 'username';
                wrapper.appendChild(username);

                // Status text element
                const statusTextEl = document.createElement('div');
                statusTextEl.className = 'status-text';
                wrapper.appendChild(statusTextEl);

                // Voice indicator element
                const voiceIndicatorEl = document.createElement('div');
                voiceIndicatorEl.className = 'voice-indicator';
                wrapper.appendChild(voiceIndicatorEl);
            }

            // Update existing elements
            const avatar = wrapper.querySelector('.avatar');
            const imgWrapper = wrapper.querySelector('.img-wrapper');
            const img = wrapper.querySelector('img');
            const statusIcon = wrapper.querySelector('.status-icon');
            const username = wrapper.querySelector('.username');

            // Update wrapper animation class
            wrapper.className = 'avatar-wrapper';
            wrapper.dataset.userId = participant.id;

            // Apply animation speed
            const speedFactor = 100 / animationSpeed;
            wrapper.style.animationDuration = (0.5 * speedFactor) + 's';

            if (participant.speaking && bounceOnSpeak) {
                const animClass = this.getAnimationClass(animationStyle);
                if (animClass) wrapper.classList.add(animClass);
            } else if (!participant.speaking && idleAnimationStyle !== 'none') {
                const idleAnimClass = this.getAnimationClass(idleAnimationStyle);
                if (idleAnimClass) wrapper.classList.add(idleAnimClass);
            }

            // Update avatar styling
            const shapeStyles = this.getShapeStyles(avatarShape);
            avatar.style.width = `${avatarSize}px`;
            avatar.style.height = `${avatarSize}px`;
            avatar.style.borderRadius = shapeStyles.borderRadius;
            avatar.style.transition = `all ${transitionDuration}ms ease`;
            avatar.style.overflow = 'visible';
            avatar.style.border = borderEnabled ? `${borderWidth}px ${borderStyle} ${borderColor}` : '';
            // Apply clip-path to avatar for proper border shape on non-rounded shapes
            if (shapeStyles.clipPath) {
                avatar.style.clipPath = shapeStyles.clipPath;
            } else {
                avatar.style.clipPath = 'none';
            }

            // Apply clip-path only to img-wrapper for proper image clipping
            if (imgWrapper) {
                imgWrapper.style.borderRadius = shapeStyles.borderRadius;
                imgWrapper.style.clipPath = shapeStyles.clipPath || 'none';
                imgWrapper.style.overflow = 'hidden';
                imgWrapper.style.position = 'relative';
                imgWrapper.style.zIndex = '5';
            }

            // Box shadow (speaking ring + glow)
            let boxShadows = [];
            if (speakingRingEnabled && participant.speaking) {
                boxShadows.push(`0 0 0 ${speakingRingWidth}px ${speakingRingColor}`);
            }
            if (glowEnabled && participant.speaking) {
                boxShadows.push(`0 0 20px ${glowColor}`, `0 0 40px ${glowColor}`);
            }
            avatar.style.boxShadow = boxShadows.join(', ');

            // Drop shadow
            avatar.style.filter = shadowEnabled ? `drop-shadow(0 4px ${shadowBlur}px ${shadowColor})` : '';

            // Update image src only if changed (prevents reload flicker)
            // Update onerror to always use current participant's fresh Discord avatar
            img.onerror = () => {
                const currentParticipant = this.participants.get(participant.id);
                const fallback = currentParticipant?.avatar || participant.avatar;
                if (img.src !== fallback) {
                    img.src = fallback;
                }
            };
            if (img.src !== new URL(imageUrl, window.location.origin).href) {
                img.src = imageUrl;
            }
            img.alt = participant.username;
            img.style.transform = flipHorizontal ? 'scaleX(-1)' : '';

            // Apply filters based on state
            let filters = [];
            let opacity = 1;

            // Apply custom avatar filters
            if (filterBrightness !== 100) filters.push(`brightness(${filterBrightness}%)`);
            if (filterContrast !== 100) filters.push(`contrast(${filterContrast}%)`);
            if (filterSaturate !== 100) filters.push(`saturate(${filterSaturate}%)`);
            if (filterHue !== 0) filters.push(`hue-rotate(${filterHue}deg)`);

            // Apply state-based filters
            if (participant.deafened && grayscaleDeafened) {
                filters.push('grayscale(80%)', 'brightness(0.7)');
            } else if (participant.muted && grayscaleMuted) {
                filters.push('grayscale(50%)');
            } else if (!participant.speaking) {
                opacity = idleOpacity / 100;
            }
            img.style.filter = filters.join(' ');
            wrapper.style.opacity = opacity;

            // Status icons
            if (showStatusIcons && (participant.muted || participant.deafened)) {
                statusIcon.style.display = 'flex';
                statusIcon.innerHTML = participant.deafened ? this.getDeafenedIcon() : this.getMutedIcon();
            } else {
                statusIcon.style.display = 'none';
            }

            // Username
            if (showName) {
                username.style.display = '';
                username.textContent = participant.username;
                username.style.color = nameColor;
                username.style.fontSize = `${nameSize}px`;
                username.style.background = nameBgEnabled ? nameBgColor : '';
                username.style.padding = nameBgEnabled ? '4px 8px' : '';
                username.style.borderRadius = nameBgEnabled ? '4px' : '';

                // Apply text shadow/glow
                let textShadows = [];
                if (nameShadowEnabled) {
                    textShadows.push(`2px 2px 4px ${nameShadowColor}`);
                }
                if (nameGlowEnabled) {
                    textShadows.push(`0 0 10px ${nameGlowColor}`, `0 0 20px ${nameGlowColor}`);
                }
                username.style.textShadow = textShadows.length > 0 ? textShadows.join(', ') : '0 2px 4px rgba(0,0,0,0.5)';

                // Apply font family
                const fontMap = {
                    'default': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    'gaming': '"Orbitron", sans-serif',
                    'handwritten': '"Comic Sans MS", cursive',
                    'retro': '"Press Start 2P", monospace',
                    'monospace': '"Courier New", monospace',
                    'elegant': '"Playfair Display", serif',
                    'bold': '"Impact", sans-serif',
                    'pixel': '"VT323", monospace',
                    // Legacy font names for backwards compatibility
                    'roboto': '"Roboto", sans-serif',
                    'poppins': '"Poppins", sans-serif',
                    'montserrat': '"Montserrat", sans-serif',
                    'opensans': '"Open Sans", sans-serif',
                    'lato': '"Lato", sans-serif',
                    'oswald': '"Oswald", sans-serif',
                    'playfair': '"Playfair Display", serif',
                    'raleway': '"Raleway", sans-serif',
                    'ubuntu': '"Ubuntu", sans-serif',
                    'comicsans': '"Comic Sans MS", cursive',
                    'impact': '"Impact", sans-serif'
                };
                username.style.fontFamily = fontMap[fontFamily] || fontMap['default'];

                // Apply name position
                wrapper.classList.remove('name-top', 'name-left', 'name-right', 'name-hidden', 'name-inside-bottom', 'name-inside-top');
                if (namePosition === 'top') {
                    wrapper.classList.add('name-top');
                } else if (namePosition === 'left') {
                    wrapper.classList.add('name-left');
                } else if (namePosition === 'right') {
                    wrapper.classList.add('name-right');
                } else if (namePosition === 'inside-bottom') {
                    wrapper.classList.add('name-inside-bottom');
                } else if (namePosition === 'inside-top') {
                    wrapper.classList.add('name-inside-top');
                }

                // Apply name animation
                username.classList.remove('name-anim-typing', 'name-anim-bounce', 'name-anim-wave', 'name-anim-glow', 'name-anim-slide');
                if (nameAnimation !== 'none') {
                    username.classList.add(`name-anim-${nameAnimation}`);
                }
            } else {
                username.style.display = 'none';
            }

            // === NEW EFFECTS ===

            // Particles effect - inside avatar so they get clipped by avatar shape
            const particlesContainer = wrapper.querySelector('.particles-container');
            if (particlesContainer) {
                if (particlesEnabled && participant.speaking) {
                    particlesContainer.style.display = 'block';
                    particlesContainer.dataset.type = particleType;
                    particlesContainer.style.setProperty('--particle-color', particleColor);
                    // Apply same clip-path as avatar to clip particles within shape
                    particlesContainer.style.clipPath = shapeStyles.clipPath || 'none';
                    particlesContainer.style.borderRadius = shapeStyles.borderRadius;
                    particlesContainer.style.overflow = 'hidden';
                    this.updateParticles(particlesContainer, particleType, particleColor, particleCount);
                } else {
                    particlesContainer.style.display = 'none';
                }
            }

            // Animated border
            const animBorderEl = wrapper.querySelector('.anim-border');
            if (animBorderEl) {
                if (animBorderEnabled && participant.speaking) {
                    animBorderEl.style.display = 'block';
                    animBorderEl.className = `anim-border anim-border-${animBorderStyle}`;
                    const speedSeconds = (11 - animBorderSpeed) * 0.5;
                    animBorderEl.style.setProperty('--anim-border-speed', `${speedSeconds}s`);
                    animBorderEl.style.top = '-4px';
                    animBorderEl.style.right = '-4px';
                    animBorderEl.style.bottom = '-4px';
                    animBorderEl.style.left = '-4px';
                    animBorderEl.style.borderRadius = shapeStyles.borderRadius;
                } else {
                    animBorderEl.style.display = 'none';
                }
            }

            // Background effect
            const bgEffectEl = wrapper.querySelector('.bg-effect');
            if (bgEffectEl) {
                if (bgEffectEnabled && bgEffectType !== 'none') {
                    bgEffectEl.style.display = 'block';
                    bgEffectEl.className = `bg-effect bg-effect-${bgEffectType}`;
                    bgEffectEl.style.setProperty('--bg-effect-color', bgEffectColor);
                    bgEffectEl.style.setProperty('--bg-effect-size', `${bgEffectSize}px`);
                } else {
                    bgEffectEl.style.display = 'none';
                }
            }

            // Outline effect
            const outlineEl = wrapper.querySelector('.avatar-outline');
            if (outlineEl) {
                if (outlineEnabled) {
                    outlineEl.style.display = 'block';
                    outlineEl.style.top = `-${outlineOffset}px`;
                    outlineEl.style.right = `-${outlineOffset}px`;
                    outlineEl.style.bottom = `-${outlineOffset}px`;
                    outlineEl.style.left = `-${outlineOffset}px`;
                    outlineEl.style.border = `${outlineWidth}px solid ${outlineColor}`;
                    outlineEl.style.borderRadius = shapeStyles.borderRadius;
                    // Apply clip-path for shapes that use it (hexagon, heart, shield, etc.)
                    if (shapeStyles.clipPath) {
                        outlineEl.style.clipPath = shapeStyles.clipPath;
                    } else {
                        outlineEl.style.clipPath = 'none';
                    }
                } else {
                    outlineEl.style.display = 'none';
                }
            }

            // Frame effect
            const frameEl = wrapper.querySelector('.avatar-frame');
            if (frameEl) {
                if (frame !== 'none') {
                    frameEl.style.display = 'block';
                    frameEl.className = `avatar-frame avatar-frame-${frame}`;
                    frameEl.style.setProperty('--frame-color', frameColor);
                    frameEl.style.top = '-8px';
                    frameEl.style.right = '-8px';
                    frameEl.style.bottom = '-8px';
                    frameEl.style.left = '-8px';
                    frameEl.style.borderRadius = shapeStyles.borderRadius;
                    // Apply clip-path for shapes that use it
                    if (shapeStyles.clipPath) {
                        frameEl.style.clipPath = shapeStyles.clipPath;
                    } else {
                        frameEl.style.clipPath = 'none';
                    }
                } else {
                    frameEl.style.display = 'none';
                }
            }

            // Accessory effect
            const accessoryEl = wrapper.querySelector('.avatar-accessory');
            if (accessoryEl) {
                if (accessory !== 'none') {
                    accessoryEl.style.display = 'block';
                    accessoryEl.className = `avatar-accessory avatar-accessory-${accessory}`;
                    accessoryEl.innerHTML = this.getAccessoryHtml(accessory);
                } else {
                    accessoryEl.style.display = 'none';
                }
            }

            // Mirror/reflection effect
            const mirrorEl = wrapper.querySelector('.avatar-mirror');
            if (mirrorEl) {
                if (mirrorEnabled) {
                    // Mirror height matches preview: 50px for 180px avatar (ratio ~0.278)
                    const mirrorH = Math.round(avatarSize * (50 / 180));
                    mirrorEl.style.display = 'block';
                    mirrorEl.style.backgroundImage = `url(${imageUrl})`;
                    mirrorEl.style.width = `${avatarSize}px`;
                    mirrorEl.style.height = `${mirrorH}px`;
                    mirrorEl.style.opacity = mirrorOpacity / 100;
                    mirrorEl.style.borderRadius = shapeStyles.borderRadius;
                    mirrorEl.style.clipPath = shapeStyles.clipPath;
                    mirrorEl.style.marginTop = `${mirrorOffset}px`;
                } else {
                    mirrorEl.style.display = 'none';
                }
            }

            // Tilt effect
            if (tiltEnabled) {
                wrapper.classList.add('tilt-enabled');
                wrapper.style.setProperty('--tilt-amount', `${tiltAmount}deg`);
            } else {
                wrapper.classList.remove('tilt-enabled');
            }

            // Voice indicator
            const voiceIndicatorEl = wrapper.querySelector('.voice-indicator');
            if (voiceIndicatorEl) {
                if (voiceIndicatorEnabled && participant.speaking) {
                    voiceIndicatorEl.style.display = 'flex';
                    voiceIndicatorEl.className = `voice-indicator voice-indicator-${voiceIndicatorStyle}`;
                    voiceIndicatorEl.style.setProperty('--voice-indicator-color', voiceIndicatorColor);
                    this.updateVoiceIndicator(voiceIndicatorEl, voiceIndicatorStyle);
                } else {
                    voiceIndicatorEl.style.display = 'none';
                }
            }

            // Status text
            const statusTextEl = wrapper.querySelector('.status-text');
            if (statusTextEl) {
                if (statusTextEnabled && statusTextValue) {
                    statusTextEl.style.display = 'block';
                    statusTextEl.textContent = statusTextValue;
                    statusTextEl.style.color = statusTextColor;
                } else {
                    statusTextEl.style.display = 'none';
                }
            }

            // Speaking highlight
            wrapper.classList.remove('highlight-glow', 'highlight-pulse', 'highlight-ring', 'highlight-shadow');
            if (highlight !== 'none' && participant.speaking) {
                wrapper.classList.add(`highlight-${highlight}`);
            }

            // Apply custom CSS
            if (customCss) {
                this.applyCustomCss(customCss, participant.id);
            }

            if (isNew) {
                // Apply entry animation
                if (entryAnimation !== 'none') {
                    wrapper.classList.add(`entry-${entryAnimation}`);
                    wrapper.style.animationDuration = `${entryDuration}ms`;
                    setTimeout(() => {
                        wrapper.classList.remove(`entry-${entryAnimation}`);
                    }, entryDuration);
                }
                container.appendChild(wrapper);
            }
        });

        this.ensureAnimationStyles();
    }

    getMutedIcon() {
        return `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M12 2C10.9 2 10 2.9 10 4V10C10 11.1 10.9 12 12 12C13.1 12 14 11.1 14 10V4C14 2.9 13.1 2 12 2Z"/>
            <path d="M19 10V11C19 14.3 16.3 17 13 17H11C7.7 17 5 14.3 5 11V10H3V11C3 15.2 6.1 18.6 10 19.4V22H14V19.4C17.9 18.6 21 15.2 21 11V10H19Z"/>
            <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="2"/>
        </svg>`;
    }

    getDeafenedIcon() {
        return `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M12 2C8.13 2 5 5.13 5 9V15C5 16.1 5.9 17 7 17H9V11H7V9C7 6.24 9.24 4 12 4C14.76 4 17 6.24 17 9V11H15V17H17C18.1 17 19 16.1 19 15V9C19 5.13 15.87 2 12 2Z"/>
            <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="2"/>
        </svg>`;
    }

    updateParticles(container, type, color, count) {
        // Only regenerate if needed
        if (container.childElementCount !== count || container.dataset.lastType !== type) {
            container.innerHTML = '';
            container.dataset.lastType = type;

            for (let i = 0; i < count; i++) {
                const particle = document.createElement('div');
                particle.className = `particle particle-${type}`;
                particle.style.setProperty('--particle-color', color);
                // Random horizontal position
                particle.style.left = `${Math.random() * 100}%`;
                // Start particles at the bottom (0-20% from bottom)
                // Using negative delay will show them at different points in their rise
                particle.style.bottom = `${Math.random() * 20}%`;
                // Use negative delay to spread particles across their animation cycle
                // This creates the effect of particles at different stages of rising
                const duration = 2 + Math.random() * 2;
                const negativeDelay = -Math.random() * duration;
                particle.style.animationDelay = `${negativeDelay}s`;
                particle.style.animationDuration = `${duration}s`;
                // Random size variation
                const scale = 0.6 + Math.random() * 0.8;
                particle.style.setProperty('--scale', scale);
                container.appendChild(particle);
            }
        }
    }

    updateVoiceIndicator(container, style) {
        if (style === 'bar') {
            if (container.childElementCount !== 5) {
                container.innerHTML = '';
                for (let i = 0; i < 5; i++) {
                    const bar = document.createElement('div');
                    bar.className = 'voice-bar';
                    bar.style.animationDelay = `${i * 0.1}s`;
                    container.appendChild(bar);
                }
            }
        } else if (style === 'wave') {
            if (container.childElementCount !== 3) {
                container.innerHTML = '';
                for (let i = 0; i < 3; i++) {
                    const wave = document.createElement('div');
                    wave.className = 'voice-wave';
                    wave.style.animationDelay = `${i * 0.2}s`;
                    container.appendChild(wave);
                }
            }
        } else if (style === 'dot') {
            if (container.childElementCount !== 3) {
                container.innerHTML = '';
                for (let i = 0; i < 3; i++) {
                    const dot = document.createElement('div');
                    dot.className = 'voice-dot';
                    dot.style.animationDelay = `${i * 0.15}s`;
                    container.appendChild(dot);
                }
            }
        } else if (style === 'ring') {
            if (container.childElementCount !== 1) {
                container.innerHTML = '<div class="voice-ring"></div>';
            }
        }
    }

    getAccessoryHtml(accessory) {
        const accessories = {
            'crown': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5M19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/></svg>',
            'halo': '<div class="accessory-halo"></div>',
            'horns': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4L8 12L4 20L8 16L12 20L16 16L20 20L16 12L20 4L16 8L12 4L8 8L4 4Z"/></svg>',
            'cat-ears': '<div class="accessory-cat-ears"><span></span><span></span></div>',
            'bunny-ears': '<div class="accessory-bunny-ears"><span></span><span></span></div>',
            'santa-hat': '<svg viewBox="0 0 24 24" fill="#e74c3c"><path d="M12 2C10 2 8.5 3.5 8.5 5.5C8.5 6.5 9 7.4 9.7 8H5L3 18H21L19 8H14.3C15 7.4 15.5 6.5 15.5 5.5C15.5 3.5 14 2 12 2Z"/><circle cx="12" cy="5" r="2" fill="white"/></svg>',
            'party-hat': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4 22H20L12 2Z"/><circle cx="8" cy="18" r="1.5" fill="#ff6b6b"/><circle cx="12" cy="14" r="1.5" fill="#4ecdc4"/><circle cx="16" cy="18" r="1.5" fill="#ffe66d"/></svg>',
            'headphones': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1C7 1 3 5 3 10V17C3 18.66 4.34 20 6 20H9V12H5V10C5 6.13 8.13 3 12 3S19 6.13 19 10V12H15V20H18C19.66 20 21 18.66 21 17V10C21 5 17 1 12 1Z"/></svg>',
            'sunglasses': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 10C3 8.9 3.9 8 5 8H19C20.1 8 21 8.9 21 10V12C21 14.2 19.2 16 17 16H15C12.8 16 11 14.2 11 12H13C13 13.1 13.9 14 15 14H17C18.1 14 19 13.1 19 12V10H5V12C5 13.1 5.9 14 7 14H9C10.1 14 11 13.1 11 12H13C13 14.2 11.2 16 9 16H7C4.8 16 3 14.2 3 12V10Z"/></svg>',
            'bowtie': '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 14L4 18V10L12 14M12 14L20 10V18L12 14M12 16C13.1 16 14 15.1 14 14S13.1 12 12 12 10 12.9 10 14 10.9 16 12 16Z"/></svg>'
        };
        return accessories[accessory] || '';
    }

    applyCustomCss(css, participantId) {
        const styleId = `cubreactive-custom-${participantId}`;
        let styleEl = document.getElementById(styleId);

        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }

        // Scope the CSS to this participant
        const scopedCss = css.replace(/([^{}]+)\{/g, (match, selector) => {
            return `[data-user-id="${participantId}"] ${selector.trim()} {`;
        });

        styleEl.textContent = scopedCss;
    }

    ensureAnimationStyles() {
        if (document.getElementById('cubreactive-animations')) return;

        const style = document.createElement('style');
        style.id = 'cubreactive-animations';
        style.textContent = `
            .status-icon {
                position: absolute;
                bottom: -5px;
                right: -5px;
                background: #ed4245;
                border-radius: 50%;
                padding: 4px;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 50;
            }

            .anim-bounce {
                animation: cr-bounce 0.5s ease infinite;
            }
            .anim-pulse {
                animation: cr-pulse 1s ease infinite;
            }
            .anim-glow .avatar {
                animation: cr-glow 1s ease infinite;
            }
            .anim-shake {
                animation: cr-shake 0.5s ease infinite;
            }
            .anim-wave {
                animation: cr-wave 1s ease infinite;
            }
            .anim-float {
                animation: cr-float 2s ease-in-out infinite;
            }
            .anim-spin {
                animation: cr-spin 2s linear infinite;
            }
            .anim-jello {
                animation: cr-jello 0.9s ease infinite;
            }
            .anim-heartbeat {
                animation: cr-heartbeat 1.3s ease-in-out infinite;
            }
            .anim-flash {
                animation: cr-flash 1s ease infinite;
            }
            .anim-rubberband {
                animation: cr-rubberband 1s ease infinite;
            }
            .anim-breathe {
                animation: cr-breathe 3s ease-in-out infinite;
            }

            /* Entry animations */
            .entry-fade {
                animation: cr-entry-fade ease-out forwards;
            }
            .entry-slide-up {
                animation: cr-entry-slide-up ease-out forwards;
            }
            .entry-slide-down {
                animation: cr-entry-slide-down ease-out forwards;
            }
            .entry-slide-left {
                animation: cr-entry-slide-left ease-out forwards;
            }
            .entry-slide-right {
                animation: cr-entry-slide-right ease-out forwards;
            }
            .entry-zoom {
                animation: cr-entry-zoom ease-out forwards;
            }
            .entry-bounce {
                animation: cr-entry-bounce ease-out forwards;
            }
            .entry-flip {
                animation: cr-entry-flip ease-out forwards;
            }

            @keyframes cr-bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }

            @keyframes cr-pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }

            @keyframes cr-glow {
                0%, 100% { box-shadow: 0 0 20px var(--glow-color, #5865f2); }
                50% { box-shadow: 0 0 40px var(--glow-color, #5865f2), 0 0 60px var(--glow-color, #5865f2); }
            }

            @keyframes cr-shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-3px); }
                75% { transform: translateX(3px); }
            }

            @keyframes cr-wave {
                0%, 100% { transform: rotate(0deg); }
                25% { transform: rotate(-3deg); }
                75% { transform: rotate(3deg); }
            }

            @keyframes cr-float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-8px); }
            }

            @keyframes cr-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            @keyframes cr-jello {
                0%, 100% { transform: scale3d(1, 1, 1); }
                30% { transform: scale3d(1.25, 0.75, 1); }
                40% { transform: scale3d(0.75, 1.25, 1); }
                50% { transform: scale3d(1.15, 0.85, 1); }
                65% { transform: scale3d(0.95, 1.05, 1); }
                75% { transform: scale3d(1.05, 0.95, 1); }
            }

            @keyframes cr-heartbeat {
                0%, 100% { transform: scale(1); }
                14% { transform: scale(1.1); }
                28% { transform: scale(1); }
                42% { transform: scale(1.1); }
                70% { transform: scale(1); }
            }

            @keyframes cr-flash {
                0%, 50%, 100% { opacity: 1; }
                25%, 75% { opacity: 0.5; }
            }

            @keyframes cr-rubberband {
                0%, 100% { transform: scale3d(1, 1, 1); }
                30% { transform: scale3d(1.15, 0.85, 1); }
                40% { transform: scale3d(0.85, 1.15, 1); }
                50% { transform: scale3d(1.1, 0.9, 1); }
                65% { transform: scale3d(0.95, 1.05, 1); }
                75% { transform: scale3d(1.02, 0.98, 1); }
            }

            @keyframes cr-breathe {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.03); }
            }

            /* Entry animation keyframes */
            @keyframes cr-entry-fade {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            @keyframes cr-entry-slide-up {
                from { opacity: 0; transform: translateY(50px); }
                to { opacity: 1; transform: translateY(0); }
            }

            @keyframes cr-entry-slide-down {
                from { opacity: 0; transform: translateY(-50px); }
                to { opacity: 1; transform: translateY(0); }
            }

            @keyframes cr-entry-slide-left {
                from { opacity: 0; transform: translateX(50px); }
                to { opacity: 1; transform: translateX(0); }
            }

            @keyframes cr-entry-slide-right {
                from { opacity: 0; transform: translateX(-50px); }
                to { opacity: 1; transform: translateX(0); }
            }

            @keyframes cr-entry-zoom {
                from { opacity: 0; transform: scale(0); }
                to { opacity: 1; transform: scale(1); }
            }

            @keyframes cr-entry-bounce {
                0% { opacity: 0; transform: scale(0.3); }
                50% { transform: scale(1.05); }
                70% { transform: scale(0.9); }
                100% { opacity: 1; transform: scale(1); }
            }

            @keyframes cr-entry-flip {
                from { opacity: 0; transform: perspective(400px) rotateY(90deg); }
                to { opacity: 1; transform: perspective(400px) rotateY(0); }
            }

            /* ========== NEW FEATURE STYLES ========== */

            /* Particles - contained within avatar shape */
            .particles-container {
                position: absolute;
                top: 0;
                right: 0;
                bottom: 0;
                left: 0;
                overflow: hidden;
                pointer-events: none;
                z-index: 5;
            }

            .particle {
                position: absolute;
                width: 6px;
                height: 6px;
                background: var(--particle-color, #ffffff);
                border-radius: 50%;
                animation: cr-particle-float 2s ease-in-out infinite;
            }

            .particle-sparkle, .particle-sparkles {
                box-shadow: 0 0 6px var(--particle-color, #ffffff);
                animation: cr-particle-sparkle 2s ease-in-out infinite;
            }

            .particle-bubble, .particle-bubbles {
                background: transparent;
                border: 2px solid var(--particle-color, #ffffff);
                width: 10px;
                height: 10px;
                animation: cr-particle-bubble 2.5s ease-in-out infinite;
            }

            .particle-star, .particle-stars {
                width: 0; height: 0;
                border-left: 4px solid transparent;
                border-right: 4px solid transparent;
                border-bottom: 8px solid var(--particle-color, #ffffff);
                background: transparent;
                border-radius: 0;
                animation: cr-particle-twinkle 1.5s ease-in-out infinite;
            }

            .particle-heart, .particle-hearts {
                width: auto;
                height: auto;
                background: transparent;
                animation: cr-particle-heart 2s ease-in-out infinite;
            }

            .particle-heart::before, .particle-hearts::before {
                content: '❤';
                font-size: 12px;
                color: var(--particle-color, #ff6b6b);
            }

            .particle-confetti {
                width: 8px;
                height: 4px;
                border-radius: 2px;
                animation: cr-particle-confetti 2s ease-out infinite;
            }

            .particle-snow {
                width: 8px;
                height: 8px;
                background: var(--particle-color, #ffffff);
                border-radius: 50%;
                animation: cr-particle-snow 3s ease-in-out infinite;
            }

            .particle-fire {
                background: var(--particle-color, #ff6b00);
                box-shadow: 0 0 8px var(--particle-color, #ff6b00);
                animation: cr-particle-fire 1.5s ease-out infinite;
            }

            .particle-music {
                width: auto;
                height: auto;
                background: transparent;
                animation: cr-particle-music 2s ease-in-out infinite;
            }

            .particle-music::before {
                content: '♪';
                font-size: 14px;
                color: var(--particle-color, #ffffff);
            }

            /* Particle animations - rise from bottom to top */
            @keyframes cr-particle-float {
                0% {
                    transform: translateY(0) translateX(0) scale(var(--scale, 1));
                    opacity: 1;
                }
                100% {
                    transform: translateY(-150px) translateX(10px) scale(var(--scale, 1));
                    opacity: 0;
                }
            }

            @keyframes cr-particle-sparkle {
                0% {
                    transform: translateY(0) scale(var(--scale, 1));
                    opacity: 1;
                    box-shadow: 0 0 6px var(--particle-color, #ffffff);
                }
                50% {
                    box-shadow: 0 0 12px var(--particle-color, #ffffff);
                }
                100% {
                    transform: translateY(-150px) scale(var(--scale, 1));
                    opacity: 0;
                    box-shadow: 0 0 6px var(--particle-color, #ffffff);
                }
            }

            @keyframes cr-particle-bubble {
                0% {
                    transform: translateY(0) scale(var(--scale, 0.8));
                    opacity: 1;
                }
                50% {
                    transform: translateY(-75px) scale(calc(var(--scale, 0.8) * 1.2));
                }
                100% {
                    transform: translateY(-150px) scale(var(--scale, 0.8));
                    opacity: 0;
                }
            }

            @keyframes cr-particle-twinkle {
                0% {
                    transform: translateY(0) rotate(0deg) scale(var(--scale, 1));
                    opacity: 1;
                }
                50% {
                    transform: translateY(-75px) rotate(180deg) scale(var(--scale, 1));
                }
                100% {
                    transform: translateY(-150px) rotate(360deg) scale(var(--scale, 1));
                    opacity: 0;
                }
            }

            @keyframes cr-particle-heart {
                0% {
                    transform: translateY(0) scale(var(--scale, 1));
                    opacity: 1;
                }
                50% {
                    transform: translateY(-75px) scale(calc(var(--scale, 1) * 1.3));
                }
                100% {
                    transform: translateY(-150px) scale(var(--scale, 1));
                    opacity: 0;
                }
            }

            @keyframes cr-particle-confetti {
                0% {
                    transform: translateY(0) rotate(0deg) scale(var(--scale, 1));
                    opacity: 1;
                }
                100% {
                    transform: translateY(-150px) rotate(360deg) scale(var(--scale, 1));
                    opacity: 0;
                }
            }

            @keyframes cr-particle-fire {
                0% {
                    transform: translateY(0) scale(var(--scale, 1));
                    opacity: 1;
                }
                50% {
                    transform: translateY(-75px) scale(calc(var(--scale, 1) * 0.7));
                    opacity: 0.8;
                }
                100% {
                    transform: translateY(-150px) scale(calc(var(--scale, 1) * 0.3));
                    opacity: 0;
                }
            }

            @keyframes cr-particle-music {
                0% {
                    transform: translateY(0) rotate(-15deg) scale(var(--scale, 1));
                    opacity: 1;
                }
                50% {
                    transform: translateY(-75px) rotate(15deg) scale(var(--scale, 1));
                }
                100% {
                    transform: translateY(-150px) rotate(-15deg) scale(var(--scale, 1));
                    opacity: 0;
                }
            }

            @keyframes cr-particle-snow {
                0% {
                    transform: translateY(0) translateX(0) scale(var(--scale, 1));
                    opacity: 1;
                }
                50% {
                    transform: translateY(-75px) translateX(15px) scale(var(--scale, 1));
                }
                100% {
                    transform: translateY(-150px) translateX(-15px) scale(var(--scale, 1));
                    opacity: 0;
                }
            }

            /* Animated Border */
            .anim-border {
                position: absolute;
                border: 3px solid transparent;
                pointer-events: none;
                z-index: 3;
                box-sizing: border-box;
            }

            .anim-border-rotate {
                background: linear-gradient(var(--anim-border-color, #5865f2), transparent) border-box;
                animation: cr-border-rotate var(--anim-border-speed, 2s) linear infinite;
                border-radius: inherit;
            }

            .anim-border-pulse {
                border-color: var(--anim-border-color, #5865f2);
                animation: cr-border-pulse var(--anim-border-speed, 2s) ease-in-out infinite;
                border-radius: inherit;
            }

            .anim-border-dash {
                border: 3px dashed var(--anim-border-color, #5865f2);
                animation: cr-border-dash var(--anim-border-speed, 2s) linear infinite;
                border-radius: inherit;
            }

            .anim-border-rainbow {
                animation: cr-border-rainbow var(--anim-border-speed, 2s) linear infinite;
                border-radius: inherit;
            }

            .anim-border-glow {
                border-color: var(--anim-border-color, #5865f2);
                animation: cr-border-glow var(--anim-border-speed, 2s) ease-in-out infinite;
                border-radius: inherit;
            }

            .anim-border-gradient-spin {
                border-radius: inherit;
            }

            .anim-border-pulse-gradient {
                border-radius: inherit;
            }

            .anim-border-neon-flicker {
                border-radius: inherit;
            }

            @keyframes cr-border-rotate {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            @keyframes cr-border-pulse {
                0%, 100% { opacity: 0.5; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.05); }
            }

            @keyframes cr-border-dash {
                0% { stroke-dashoffset: 0; }
                100% { stroke-dashoffset: 100; }
            }

            @keyframes cr-border-rainbow {
                0% { border-color: #ff6b6b; }
                16% { border-color: #feca57; }
                33% { border-color: #48dbfb; }
                50% { border-color: #1dd1a1; }
                66% { border-color: #5f27cd; }
                83% { border-color: #ff9ff3; }
                100% { border-color: #ff6b6b; }
            }

            @keyframes cr-border-glow {
                0%, 100% { box-shadow: 0 0 5px var(--anim-border-color, #5865f2); }
                50% { box-shadow: 0 0 20px var(--anim-border-color, #5865f2), 0 0 40px var(--anim-border-color, #5865f2); }
            }

            /* Background Effects */
            .bg-effect {
                position: absolute;
                top: calc(var(--bg-effect-size, 20px) * -1);
                right: calc(var(--bg-effect-size, 20px) * -1);
                bottom: calc(var(--bg-effect-size, 20px) * -1);
                left: calc(var(--bg-effect-size, 20px) * -1);
                pointer-events: none;
                z-index: -1;
            }

            .bg-effect-glow {
                background: radial-gradient(circle, var(--bg-effect-color, #5865f2) 0%, transparent 70%);
                opacity: 0.5;
            }

            .bg-effect-pulse {
                background: radial-gradient(circle, var(--bg-effect-color, #5865f2) 0%, transparent 70%);
                animation: cr-bg-pulse 2s ease-in-out infinite;
            }

            .bg-effect-spotlight {
                background: conic-gradient(from 0deg, transparent, var(--bg-effect-color, #5865f2), transparent);
                animation: cr-bg-spotlight 3s linear infinite;
            }

            .bg-effect-ripple {
                border: 2px solid var(--bg-effect-color, #5865f2);
                border-radius: 50%;
                animation: cr-bg-ripple 2s ease-out infinite;
            }

            @keyframes cr-bg-pulse {
                0%, 100% { opacity: 0.3; transform: scale(1); }
                50% { opacity: 0.6; transform: scale(1.1); }
            }

            @keyframes cr-bg-spotlight {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            @keyframes cr-bg-ripple {
                0% { transform: scale(0.8); opacity: 1; }
                100% { transform: scale(1.5); opacity: 0; }
            }

            /* Avatar Outline */
            .avatar-outline {
                position: absolute;
                pointer-events: none;
                z-index: 1;
                box-sizing: border-box;
            }

            /* Avatar Frame */
            .avatar-frame {
                position: absolute;
                pointer-events: none;
                z-index: 2;
                box-sizing: border-box;
            }

            .avatar-frame-simple {
                border: 4px solid var(--frame-color, #5865f2);
                border-radius: inherit;
            }

            .avatar-frame-double {
                border: 2px solid var(--frame-color, #5865f2);
                box-shadow: 0 0 0 4px transparent, 0 0 0 6px var(--frame-color, #5865f2);
                border-radius: inherit;
            }

            .avatar-frame-ornate {
                border: 4px solid var(--frame-color, #5865f2);
                box-shadow: inset 0 0 10px var(--frame-color, #5865f2);
                border-radius: inherit;
            }

            .avatar-frame-gaming {
                border: 3px solid var(--frame-color, #00ff00);
                border-radius: inherit;
            }

            .avatar-frame-pixel {
                border: 4px solid var(--frame-color, #ffd700);
                border-radius: inherit;
            }

            .avatar-frame-leaves {
                border: 4px solid #2ecc71;
                border-radius: inherit;
            }

            .avatar-frame-fire {
                border: 4px solid #e74c3c;
                box-shadow: 0 0 15px #ff6b6b;
                border-radius: inherit;
            }

            .avatar-frame-corners::before,
            .avatar-frame-corners::after {
                content: '';
                position: absolute;
                width: 20px;
                height: 20px;
                border: 3px solid var(--frame-color, #5865f2);
            }

            .avatar-frame-corners::before {
                top: 0; left: 0;
                border-right: none; border-bottom: none;
            }

            .avatar-frame-corners::after {
                bottom: 0; right: 0;
                border-left: none; border-top: none;
            }

            .avatar-frame-neon {
                border: 3px solid var(--frame-color, #5865f2);
                box-shadow: 0 0 10px var(--frame-color, #5865f2), inset 0 0 10px var(--frame-color, #5865f2);
                animation: cr-frame-neon 2s ease-in-out infinite;
                border-radius: inherit;
            }

            @keyframes cr-frame-neon {
                0%, 100% { box-shadow: 0 0 10px var(--frame-color, #5865f2), inset 0 0 10px var(--frame-color, #5865f2); }
                50% { box-shadow: 0 0 20px var(--frame-color, #5865f2), 0 0 40px var(--frame-color, #5865f2), inset 0 0 20px var(--frame-color, #5865f2); }
            }

            /* Accessories */
            .avatar-accessory {
                position: absolute;
                pointer-events: none;
                z-index: 20;
            }

            .avatar-accessory-crown {
                top: -25px;
                left: 50%;
                transform: translateX(-50%);
                width: 40px;
                height: 30px;
                color: #ffd700;
            }

            .avatar-accessory-crown svg {
                width: 100%;
                height: 100%;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
            }

            .avatar-accessory-halo {
                top: -15px;
                left: 50%;
                transform: translateX(-50%);
            }

            .accessory-halo {
                width: 60px;
                height: 15px;
                border: 3px solid #ffd700;
                border-radius: 50%;
                box-shadow: 0 0 10px #ffd700;
            }

            .avatar-accessory-cat-ears {
                top: -20px;
                left: 50%;
                transform: translateX(-50%);
            }

            .accessory-cat-ears {
                display: flex;
                gap: 30px;
            }

            .accessory-cat-ears span {
                width: 0;
                height: 0;
                border-left: 12px solid transparent;
                border-right: 12px solid transparent;
                border-bottom: 20px solid #ff9ff3;
            }

            .avatar-accessory-bunny-ears {
                top: -35px;
                left: 50%;
                transform: translateX(-50%);
            }

            .accessory-bunny-ears {
                display: flex;
                gap: 20px;
            }

            .accessory-bunny-ears span {
                width: 15px;
                height: 40px;
                background: #ffcccc;
                border-radius: 50% 50% 40% 40%;
            }

            .avatar-accessory-santa-hat,
            .avatar-accessory-party-hat {
                top: -30px;
                left: 50%;
                transform: translateX(-50%);
                width: 40px;
                height: 40px;
            }

            .avatar-accessory-headphones {
                top: -10px;
                left: 50%;
                transform: translateX(-50%);
                width: 70px;
                height: 30px;
                color: #333;
            }

            .avatar-accessory-sunglasses {
                top: 25%;
                left: 50%;
                transform: translateX(-50%);
                width: 60px;
                height: 25px;
                color: #333;
            }

            .avatar-accessory-bowtie {
                bottom: -15px;
                left: 50%;
                transform: translateX(-50%);
                width: 30px;
                height: 20px;
                color: #e74c3c;
            }

            /* Mirror/Reflection */
            .avatar-mirror {
                position: relative;
                margin-top: 5px; /* overridden by JS mirror_offset */
                background-size: cover;
                background-position: center bottom;
                transform: scaleY(-1);
                mask-image: linear-gradient(to bottom, rgba(0,0,0,0.3), transparent);
                -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.3), transparent);
            }

            /* Tilt Effect */
            .tilt-enabled {
                transform: perspective(1000px) rotateX(var(--tilt-amount, 5deg));
            }

            /* Voice Indicator */
            .voice-indicator {
                display: flex;
                align-items: flex-end;
                justify-content: center;
                gap: 3px;
                margin-top: 8px;
                height: 20px;
            }

            .voice-bar {
                width: 4px;
                height: 100%;
                background: var(--voice-indicator-color, #57f287);
                border-radius: 2px;
                animation: cr-voice-bar 0.5s ease-in-out infinite alternate;
            }

            .voice-wave {
                width: 20px;
                height: 20px;
                border: 2px solid var(--voice-indicator-color, #57f287);
                border-radius: 50%;
                animation: cr-voice-wave 1s ease-out infinite;
            }

            .voice-dot {
                width: 8px;
                height: 8px;
                background: var(--voice-indicator-color, #57f287);
                border-radius: 50%;
                animation: cr-voice-dot 0.6s ease-in-out infinite;
            }

            .voice-ring {
                width: 30px;
                height: 30px;
                border: 3px solid var(--voice-indicator-color, #57f287);
                border-radius: 50%;
                animation: cr-voice-ring 1s ease-out infinite;
            }

            @keyframes cr-voice-bar {
                0% { height: 20%; }
                100% { height: 100%; }
            }

            @keyframes cr-voice-wave {
                0% { transform: scale(0.5); opacity: 1; }
                100% { transform: scale(1.5); opacity: 0; }
            }

            @keyframes cr-voice-dot {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.5); }
            }

            @keyframes cr-voice-ring {
                0% { transform: scale(0.8); opacity: 1; }
                100% { transform: scale(1.3); opacity: 0; }
            }

            /* Name Position Variants */
            .name-top {
                flex-direction: column-reverse;
            }

            .name-top .username {
                margin-bottom: 8px;
                margin-top: 0;
            }

            .name-left {
                flex-direction: row-reverse;
            }

            .name-left .username {
                margin-right: 12px;
                margin-top: 0;
            }

            .name-right {
                flex-direction: row;
            }

            .name-right .username {
                margin-left: 12px;
                margin-top: 0;
            }

            .name-inside-bottom,
            .name-inside-top {
                position: relative;
            }

            .name-inside-bottom .username,
            .name-inside-top .username {
                position: absolute;
                left: 50%;
                transform: translateX(-50%);
                margin: 0;
                padding: 4px 8px;
                background: rgba(0, 0, 0, 0.6);
                border-radius: 4px;
            }

            .name-inside-bottom .username {
                bottom: 8px;
            }

            .name-inside-top .username {
                top: 8px;
            }

            /* Name Animations */
            .name-anim-typing {
                overflow: hidden;
                white-space: nowrap;
                animation: cr-name-typing 3s steps(30) infinite;
            }

            .name-anim-bounce {
                animation: cr-name-bounce 1s ease infinite;
            }

            .name-anim-wave {
                animation: cr-name-wave 2s ease-in-out infinite;
            }

            .name-anim-glow {
                animation: cr-name-glow 2s ease-in-out infinite;
            }

            .name-anim-slide {
                animation: cr-name-slide 3s ease-in-out infinite;
            }

            @keyframes cr-name-typing {
                0%, 100% { width: 0; }
                50% { width: 100%; }
            }

            @keyframes cr-name-bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-5px); }
            }

            @keyframes cr-name-wave {
                0%, 100% { transform: rotate(-2deg); }
                50% { transform: rotate(2deg); }
            }

            @keyframes cr-name-glow {
                0%, 100% { text-shadow: 0 0 5px currentColor; }
                50% { text-shadow: 0 0 20px currentColor, 0 0 30px currentColor; }
            }

            @keyframes cr-name-slide {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-5px); }
                75% { transform: translateX(5px); }
            }

            /* Status Text */
            .status-text {
                font-size: 11px;
                opacity: 0.8;
                margin-top: 4px;
                text-align: center;
            }

            /* Speaking Highlights */
            .highlight-glow {
                filter: drop-shadow(0 0 15px var(--speaking-ring-color, #57f287));
            }

            .highlight-pulse .avatar {
                animation: cr-highlight-pulse 1s ease-in-out infinite;
            }

            .highlight-ring::after {
                content: '';
                position: absolute;
                top: -8px;
                right: -8px;
                bottom: -8px;
                left: -8px;
                border: 3px solid var(--speaking-ring-color, #57f287);
                border-radius: inherit;
                animation: cr-highlight-ring 1s ease-out infinite;
            }

            .highlight-shadow {
                filter: drop-shadow(0 8px 15px rgba(0,0,0,0.5));
            }

            @keyframes cr-highlight-pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
            }

            @keyframes cr-highlight-ring {
                0% { transform: scale(1); opacity: 1; }
                100% { transform: scale(1.2); opacity: 0; }
            }

            /* Import Google Fonts */
            @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Poppins:wght@400;600&family=Montserrat:wght@400;600&family=Open+Sans:wght@400;600&family=Lato:wght@400;700&family=Oswald:wght@400;600&family=Playfair+Display:wght@400;700&family=Raleway:wght@400;600&family=Ubuntu:wght@400;500&family=Orbitron:wght@400;700&family=Press+Start+2P&family=VT323&display=swap');
        `;
        document.head.appendChild(style);
    }

    startPing() {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            this.send({ type: 'PING' });
        }, 30000);
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    send(payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        }
    }

    showStatus(message, type = '') {
        const overlay = document.getElementById('status-overlay');
        overlay.textContent = message;
        overlay.className = 'status-overlay ' + type;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const overlay = new CubReactiveOverlay();
    overlay.init();

    // Re-render on window resize to recalculate auto-scaling
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            overlay.render();
        }, 100);
    });
});

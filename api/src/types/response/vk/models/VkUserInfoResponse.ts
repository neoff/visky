/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * User info
 */
export type VkUserInfoResponse = {
    profile?: {
        id?: number;
        first_name?: string;
        last_name?: string;
        can_access_closed?: boolean;
        is_closed?: boolean;
    };
    info?: {
        '2fa_required'?: number;
        audio_ads?: {
            day_limit?: number;
            track_limit?: number;
            types_allowed?: Array<string>;
            sections?: Array<string>;
        };
        audio_permissions?: {
            audio_meta_info?: boolean;
        };
        business_notify_enabled?: number;
        change_email_url?: string;
        change_phone_url?: string;
        country?: string;
        debug_available?: boolean;
        email?: string;
        email_status?: string;
        eu_user?: boolean;
        feed_preloading?: {
            media_discover?: {
                on_app_start?: {
                    enabled?: boolean;
                };
            };
            breaking_news?: {
                on_app_start?: {
                    enabled?: boolean;
                };
                on_neighbour_tab?: {
                    enabled?: boolean;
                };
            };
        };
        https_required?: number;
        intro?: number;
        music_intro?: number;
        fave_intro?: number;
        menu_intro?: boolean;
        community_comments?: boolean;
        track_installed_apps?: boolean;
        clickable_stickers?: {
            max_stickers?: {
                hashtag?: number;
                mention?: number;
                music?: number;
                playlist?: number;
                video?: number;
                question?: number;
                place?: number;
                story_reply?: number;
                owner?: number;
                market_item?: number;
                link?: number;
                post?: number;
                poll?: number;
                sticker?: number;
                app?: number;
                situational_theme?: number;
                spoiler?: number;
            };
        };
        reports_spa?: boolean;
        lang?: number;
        money_p2p_params?: {
            min_amount?: number;
            max_amount?: number;
            currency?: string;
            show_intro?: boolean;
        };
        no_wall_replies?: number;
        own_posts_default?: number;
        phone?: string;
        phone_status?: string;
        profiler_enabled?: boolean;
        profiler_settings?: {
            api_requests?: boolean;
            download_patterns?: Array<{
                type?: string;
                pattern?: string;
                probability?: number;
                error_probability?: number;
            }>;
        };
        raise_to_record_enabled?: boolean;
        settings?: Array<{
            available?: boolean;
            forced?: boolean;
            name?: string;
            value?: string;
        }>;
        support_url?: string;
        valid_from?: {
            discover_posts?: number;
            discover_categories?: number;
        };
        vk_pay_endpoint?: string;
        vk_pay_endpoint_v2?: string;
        stream_special_comment_price?: number;
        menu_ads_easy_promote?: {
            item_url?: string;
            item_text?: string;
            show_badge?: boolean;
        };
        side_menu_custom_items?: Array<{
            icon?: string;
            title?: string;
            action?: {
                type?: string;
                target?: string;
                url?: string;
            };
        }>;
        subscription_combo_allowed?: boolean;
        include_channel_notifications?: boolean;
        messages_transcript_auto_show?: boolean;
        messages_multiline_input?: boolean;
        messages_translation_language_pairs?: Array<string>;
        obscene_text_filter?: boolean;
        messages_reaction_notifications?: {
            max_message_age_sec: number;
            max_reactions: number;
        };
        market_adult_18plus?: {
            is_adult_by_profile: boolean;
            is_adult_confirm: boolean;
        };
        can_change_password?: boolean;
        is_personal_ads_easy_promote_enabled?: boolean;
        messages_counter_settings?: {
            include_muted?: boolean;
            include_group_dialogs?: boolean;
            include_channels?: boolean;
        };
    };
    time?: number;
    has_new_items?: {
        global_promotion?: number;
        store_new_items?: number;
        stickers_version_hash?: string;
        favorite_stickers_version_hash?: string;
    };
    allow_buy_votes?: boolean;
    ads_stoplist?: any[];
    use_vigo?: boolean;
    html_games_supported?: number;
    defaultAudioPlayer?: string;
};


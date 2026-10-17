/** Definition version 1: IDs are stable and never imply people or lifetime history. */
export const METRIC_DEFINITIONS = Object.freeze({
 page_views:{label:'Page views',unit:'count',method:'distinct_page_instances',archive:true,definition:'Distinct site and page instance with page_viewed in the selected interval.'},
 sessions:{label:'Sessions observed',unit:'count',method:'distinct_observed_sessions',definition:'Distinct site and session IDs with an eligible observation in the selected raw interval.'},
 browser_ids:{label:'Consented browser IDs',unit:'count',method:'distinct_browser_ids',definition:'Distinct site and consented browser IDs in the selected raw interval, not people.'},
 repeat_browser_ids:{label:'Repeat browser IDs within period',unit:'count',method:'multiple_sessions_in_window',definition:'Browser IDs observed in at least two distinct sessions in this raw interval; not lifetime returners or cohort retention.'},
 active_ms:{label:'Active time estimate',unit:'ms',method:'page_revision_differences',archive:true,estimate:true,definition:'Nonnegative cumulative revision differences per site/page instance assigned to observation time; boundary timing is estimated and earlier raw baselines may be missing.'},
 cta_clicks:{label:'CTA clicks',unit:'count',method:'semantic_cta_events',archive:true},
 section_exposed_views:{label:'Exposed page-section views',unit:'count',method:'distinct_page_section_exposures'},
 section_cta_after_exposure_views:{label:'Views with CTA after exposure',unit:'count',method:'ordered_page_section_cta'},
 section_reach:{label:'Section reach',unit:'ratio',method:'exposed_over_eligible_page_section_views'},
 download_clicks:{label:'Download clicks',unit:'count',method:'semantic_download_events',archive:true},
 download_redirects:{label:'Gateway redirects',unit:'count',method:'operational_gateway_requests'},
 provider_count_delta:{label:'Provider counter delta',unit:'count',method:'consecutive_provider_observations'},
 transfer_served:{label:'Transfers served',unit:'count',method:'qualified_delivery_evidence'},
 first_observed_opens:{label:'First observed app opens',unit:'count',method:'qualified_native_ledger'},
 activations:{label:'Activations',unit:'count',method:'qualified_native_ledger'},
 download_click_session_rate:{label:'Page-to-download session rate',unit:'ratio',method:'ordered_same_session'},
 signup_completion_rate:{label:'Signup completion rate',unit:'ratio',method:'qualified_matching_population'},
 retention_d7:{label:'D7 retention',unit:'ratio',method:'unmeasured_cohort_retention'},
 LCP_p75:{label:'LCP p75',unit:'ms',method:'latest_vital_revision_p75'},INP_p75:{label:'INP p75',unit:'ms',method:'latest_vital_revision_p75'},CLS_p75:{label:'CLS p75',unit:'score',method:'latest_vital_revision_p75'},
 javascript_errors:{label:'JavaScript errors',unit:'count',method:'normalized_error_events'},accepted_events:{label:'Accepted events',unit:'count',method:'collector_health_counters'},
 account_page_views:{label:'Account profile views',unit:'count',method:'observed_account_profile_pages'},profile_edit_starts:{label:'Profile edit starts',unit:'count',method:'observed_profile_edit_actions'},profile_save_submissions:{label:'Profile save submissions',unit:'count',method:'observed_profile_submit_actions'},logout_clicks:{label:'Logout clicks',unit:'count',method:'observed_logout_actions'},account_active_ms:{label:'Account active time estimate',unit:'ms',method:'account_revision_differences',estimate:true}
});
export const VIEW_METRICS = Object.freeze({overview:['page_views','sessions','browser_ids','repeat_browser_ids','active_ms'],acquisition:['sessions'],pages:['page_views','active_ms'],sections:['section_exposed_views','section_cta_after_exposure_views','section_reach'],journeys:['download_click_session_rate','signup_completion_rate','retention_d7'],downloads:['download_clicks','download_redirects','provider_count_delta','transfer_served','first_observed_opens','activations'],accounts:['account_page_views','profile_edit_starts','profile_save_submissions','logout_clicks','account_active_ms'],quality:['LCP_p75','INP_p75','CLS_p75','javascript_errors'],health:['accepted_events']});

/** Scope verified against C/src/index.html and R/app page/DocPage/SiteFooter
 * markup. Add page-section applicability here when instrumentation changes.
 * A registry entry alone does not imply that section exists on every page. */
export const PAGE_SECTION_SCOPE:Readonly<Record<string,Readonly<Record<string,readonly string[]>>>>=Object.freeze({
 codevalanche:{home:['hero','product_principle','product','accounts','parallel','workflow','details','showcase','companion','privacy_principles','download','proof','faq','footer'],how_it_works:['hero','workflow','showcase','footer'],agents:['hero','accounts','details','showcase','footer'],multiple_accounts:['hero','accounts','workflow','faq','footer'],local_ai:['hero','accounts','showcase','privacy_principles','faq','footer'],docs:['hero','workflow','details','faq','footer'],download:['hero','download','faq','footer'],security:['hero','privacy_principles','details','faq','footer'],changelog:['footer'],privacy:['footer'],terms:['footer']},
 radovar:{home:['intro','codevalanche','company','resources','footer'],docs:['intro','resources','footer'],security:['intro','resources','footer'],privacy:['intro','resources','footer'],terms:['intro','resources','footer'],press:['intro','company','resources','footer'],releases_archive:['intro','resources','footer'],changelog_archive:['intro','resources','footer'],company:['intro','company','codevalanche','resources','footer'],codevalanche:['intro','codevalanche','resources','footer'],not_found:['intro','footer']}
});

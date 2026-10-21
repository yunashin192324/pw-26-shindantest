import type { OfficialReference } from './types';

/**
 * Adobe公式資料への参照。
 *
 * 登録条件:
 * - 2026-10-21 に Web 検索を行い、検索結果に URL とページ題名が表示されたものだけを登録した。
 * - この開発環境からは helpx.adobe.com へ直接接続できなかったため、ページ本文は開いておらず、
 *   元資料の記載内容との照合も行っていない。そのため状態は「未確認」とし、所在のみを示す。
 * - 題名は検索結果に表示された英語題名をそのまま記載している。
 */
const CHECKED_ON = '2026-10-21';
const METHOD =
  'Web検索の結果に表示されたURLとページ題名を確認。ページ本文はこの環境から取得できず、内容は未照合。';

function ref(title: string, url: string): OfficialReference {
  return { title, url, checkedOn: CHECKED_ON, checkMethod: METHOD, status: 'unverified' };
}

export const officialRefs = {
  psGenAiOverview: ref(
    'Generative AI features in Photoshop',
    'https://helpx.adobe.com/photoshop/desktop/generative-ai/generative-ai-features-overview.html',
  ),
  psGenerativeFill: ref(
    'Use Generative Fill in Photoshop on desktop',
    'https://helpx.adobe.com/photoshop/desktop/create-open-import-images/create-images/edit-images-with-generative-fill.html',
  ),
  psGenerativeExpand: ref(
    'Explore beyond the canvas with Generative Expand（検索結果の題名表示は “Enhance Detail for sharper Generative Fill variations”）',
    'https://helpx.adobe.com/photoshop/desktop/create-open-import-images/create-images/explore-beyond-the-canvas-with-generative-expand.html',
  ),
  psGenerateImage: ref(
    'Generate images from text prompts in Photoshop',
    'https://helpx.adobe.com/photoshop/desktop/create-open-import-images/create-images/generate-image-with-descriptive-text-prompts.html',
  ),
  psHarmonize: ref(
    'Blend objects with Harmonize in Photoshop',
    'https://helpx.adobe.com/photoshop/desktop/repair-retouch/remove-objects-fill-space/blend-subjects-with-harmonize.html',
  ),
  psPromptToEdit: ref(
    'Edit images with Prompt to edit in Photoshop',
    'https://helpx.adobe.com/photoshop/desktop/create-open-import-images/create-images/edit-images-with-prompt-to-edit.html',
  ),
  psAiAssistedMode: ref(
    'Edit images in AI Assisted mode in Photoshop',
    'https://helpx.adobe.com/photoshop/desktop/generative-ai/use-ai-assisted-mode.html',
  ),
  psSelectSubject: ref(
    'Select subjects in images in Photoshop',
    'https://helpx.adobe.com/photoshop/using/quick-actions/select-subject.html',
  ),
  psImprovedSelectSubject: ref(
    'Improve Select Subject and Remove Background in Photoshop',
    'https://helpx.adobe.com/photoshop/desktop/make-selections/automatic-color-based-selections/improved-select-subject-and-remove-background-results.html',
  ),
  psRemoveBackground: ref(
    'Remove image backgrounds in Photoshop',
    'https://helpx.adobe.com/photoshop/desktop/repair-retouch/remove-objects-fill-space/remove-background-in-your-images.html',
  ),
  psSelectAndMask: ref('Refine selections in Photoshop', 'https://helpx.adobe.com/photoshop/using/select-mask.html'),
  psRemoveTool: ref(
    'Replace distractions with Remove tool',
    'https://helpx.adobe.com/photoshop/using/tool-techniques/remove-tool.html',
  ),
  psGenerativeUpscale: ref(
    'Enhance image quality with Generative Upscale in Photoshop',
    'https://helpx.adobe.com/photoshop/desktop/repair-retouch/clean-restore-images/enhance-image-quality-with-generative-upscale.html',
  ),
  psWhatsNew: ref(
    "What's new in Adobe Photoshop on desktop",
    'https://helpx.adobe.com/photoshop/desktop/whats-new/whats-new-in-adobe-photoshop-on-desktop.html',
  ),
  psReleaseNotes: ref(
    'Adobe Photoshop on desktop release notes',
    'https://helpx.adobe.com/photoshop/desktop/whats-new/photoshop-on-desktop-release-notes.html',
  ),
  psHelp: ref('Photoshop Desktop Help', 'https://helpx.adobe.com/photoshop/desktop.html'),
  psBatch: ref(
    'Batch-process files in Photoshop',
    'https://helpx.adobe.com/photoshop/desktop/automate-tasks/process-a-batch-of-files/batch-process-files.html',
  ),
  psImageProcessor: ref(
    'Convert files with Image Processor in Photoshop',
    'https://helpx.adobe.com/photoshop/desktop/automate-tasks/process-a-batch-of-files/convert-files-with-the-image-processor.html',
  ),
  psDroplet: ref(
    'Create droplets from actions in Photoshop',
    'https://helpx.adobe.com/photoshop/desktop/automate-tasks/process-a-batch-of-files/create-a-droplet-from-an-action.html',
  ),
  psDeveloper: ref('Photoshop APIs for developers and scripters', 'https://developer.adobe.com/photoshop/'),
  psUxpScripting: ref('UXP Scripting', 'https://developer.adobe.com/photoshop/uxp/2022/scripting/'),
  lrAssistedCulling: ref(
    'Choose the best photos with Assisted Culling',
    'https://helpx.adobe.com/lightroom/desktop/organize-photos/assisted-culling.html',
  ),
  lrcAssistedCulling: ref(
    'Select best photos with Assisted Culling（Lightroom Classic）',
    'https://helpx.adobe.com/lightroom-classic/desktop/organize-photos-in-lightroom-classic/assisted-culling.html',
  ),
  lrPromptToEdit: ref(
    'Edit photos using prompts',
    'https://helpx.adobe.com/lightroom/desktop/edit-photos/edit-photos-using-prompts.html',
  ),
  lrRemoveReflections: ref(
    'Remove windows reflections in a photo',
    'https://helpx.adobe.com/lightroom/desktop/edit-photos/remove-reflections.html',
  ),
  lrEnhance: ref(
    'Easily enhance image quality in Lightroom',
    'https://helpx.adobe.com/lightroom/desktop/edit-photos/enhance-details.html',
  ),
  lrMasks: ref(
    'Create masks in Lightroom',
    'https://helpx.adobe.com/lightroom/mobile/masks-and-selective-adjustments/create-masks.html',
  ),
  lrWhatsNew: ref("What's new in Lightroom", 'https://helpx.adobe.com/lightroom/desktop/introduction/whats-new.html'),
  lrReleaseNotes: ref(
    'Adobe Lightroom desktop release notes',
    'https://helpx.adobe.com/lightroom/desktop/introduction/release-notes.html',
  ),
  lrHelp: ref('Lightroom Desktop Help', 'https://helpx.adobe.com/lightroom/desktop.html'),
  lrcReleaseNotes: ref(
    'Adobe Lightroom Classic release notes',
    'https://helpx.adobe.com/lightroom-classic/desktop/introduction-to-lightroom-classic/release-notes.html',
  ),
  lrcCopyPaste: ref(
    'Copy and paste edit settings（Lightroom Classic）',
    'https://helpx.adobe.com/lightroom-classic/desktop/help/copy-paste-settings.html',
  ),
  acrGenerativeExpand: ref(
    'Expand an image with Generative Expand in Adobe Camera Raw',
    'https://helpx.adobe.com/camera-raw/using/generative-expand.html',
  ),
  acrAiEditStatus: ref(
    'View AI Edit Status and manage updates（Camera Raw）',
    'https://helpx.adobe.com/camera-raw/desktop/ai-and-generative-features/ai-edit-status.html',
  ),
  fireflyFaq: ref(
    'Adobe Firefly FAQ',
    'https://helpx.adobe.com/firefly/web/get-started/learn-the-basics/adobe-firefly-faq.html',
  ),
  fireflyCredits: ref(
    'Generative credits overview',
    'https://helpx.adobe.com/firefly/web/get-started/learn-the-basics/generative-credits-overview.html',
  ),
  partnerModels: ref(
    'Partner models in Adobe products',
    'https://helpx.adobe.com/creative-cloud/apps/generative-ai/non-adobe-models-in-adobe-products.html',
  ),
  illustratorFirefly: ref(
    'Place and edit images from the Adobe Firefly website in-app（Illustrator）',
    'https://helpx.adobe.com/illustrator/desktop/add-and-import-files/import-from-other-apps/place-and-edit-adobe-firefly-output-in-app.html',
  ),
  expressHelp: ref('Adobe Express Web Help', 'https://helpx.adobe.com/express/get-set-up/learn-the-basics/overview.html'),
  expressWhatsNew: ref("What's new in Adobe Express", 'https://helpx.adobe.com/express/web/whats-new/whats-new.html'),
} satisfies Record<string, OfficialReference>;

export type OfficialRefKey = keyof typeof officialRefs;

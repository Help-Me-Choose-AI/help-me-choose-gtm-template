# Help Me Choose AI – Google Tag Manager template

Adds [Help Me Choose AI](https://helpmechoose.ai) product-finder quizzes to a
website through Google Tag Manager, without a Custom HTML tag.

## Setting it up

1. In Help Me Choose, open **Live URLs** and copy your project ID. It is the
   part after `hmc:` in the quiz tag snippet, and the part of the page address
   between `/organizations/` and `/live-urls`.
2. Add the template to your GTM container:
   - **From the Community Template Gallery:** go to **Tags → New → Tag
     Configuration**, search for **Help Me Choose AI**, and add it.
   - **Or import it yourself:** download
     [template.tpl](https://github.com/alryrie/help-me-choose-gtm-template/releases/latest/download/template.tpl),
     then go to **Templates → Tag Templates → New**, open the **⋮** menu,
     choose **Import**, select the file and click **Save**. Then create a
     new tag from it under **Tags → New → Tag Configuration**.
3. Paste your project ID into **Project ID**.
4. Set the trigger to **All Pages** (or **Initialization – All Pages**).
5. Preview, then publish the container.

The tag loads on every page, but a quiz only appears on the pages you list under
**Page configuration** on the Live URLs page. You manage which pages show a quiz
in Help Me Choose, not in GTM. Full guide:
https://app.helpmechoose.ai/docs/getting-quiz-live

### Consent

The template itself sets no cookies. The quiz widget it loads keeps quiz
progress in the browser's local storage and sets one functional cookie so the
prompt bubble isn't shown again straight away. If your container uses Consent
Mode, you can add consent checks under **Advanced Settings → Consent Settings**
in the usual way.

## What the tag does

It writes `window.iintf_data = { key: "hmc:<project ID>" }`, then loads
`https://cdn.iintf.co/help-me-choose-client/js/app.js`. This is the same as the
two-line snippet on the Live URLs page. Those two actions are the only
permissions the template asks for, plus console logging in debug mode.

## Development

The template's tests live in the `___TESTS___` section of `template.tpl` and
run in the GTM template editor (**Templates → Tag Templates → New → ⋮ → Import**,
then the **Tests** tab). You can also run them locally against an emulation of
the sandboxed APIs, which also checks the declared permissions:

```sh
node test/run-tests.mjs
```

To release a change, commit the updated `template.tpl`, then add that commit's
SHA to the top of `versions` in `metadata.yaml`.

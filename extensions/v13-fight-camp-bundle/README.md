# V13 Fight Camp Bundle (Shopify Function)

Run once after cloning (needs a linked app):

    shopify app function schema --path extensions/v13-fight-camp-bundle   # writes schema.graphql
    npm --prefix extensions/v13-fight-camp-bundle install
    shopify app function typegen --path extensions/v13-fight-camp-bundle

Test locally: `shopify app function run --path extensions/v13-fight-camp-bundle`

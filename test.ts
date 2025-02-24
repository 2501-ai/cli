import execa from 'execa';

(async () => {
  const cmd =
    "cd /Users/alexandrepereira/Desktop/test && trap '' SIGINT && npx --yes create-strapi@latest my-project --no-run --quickstart --skip-cloud --skip-db --no-install && cd my-project && npm install && npm run develop";
  const { stderr, stdout } = await execa(cmd, {
    shell: true,
    preferLocal: true,
  });

  //   const data = await shelljs.exec(
  //     'cd /Users/alexandrepereira/Desktop/test && npx --yes create-strapi@latest superapp --no-run --quickstart --skip-cloud --skip-db --no-install'
  //   );
  console.log({ stderr, stdout });
})();

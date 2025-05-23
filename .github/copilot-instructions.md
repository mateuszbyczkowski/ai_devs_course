Unless asked otherwise, never create new projects (with dedicated package.json). Instead, add scripts to existing package.json.
When specifically asked to create a new `task`, create a new directory in `ai_devs_course` with the name `task<task_number>`. Infer the task number by looking at the existing directories. The main file of each task shoud be `app.ts`. If you're asked to change/add something in the existing task, don't create a new one.
When working in the `ai_devs_course` directory:

- never import files from outside the `ai_devs_course` directory - if you find some service or module that you want to use, copy it to the `ai_devs_course` directory instead.
- never import files from between `task` directories. These are supposed to be independent.
- store all generic services and utils (like `OpenAIService`) in the `ai_devs_course/services` directory so they can be reused.
- when working on a task, check if some services or services are already implemented in the `ai_devs_course/services` directory. If they are, use them instead of implementing your own.
- if service from `ai_devs_course/services` matches the scope of the task, but is missing some functionality, you can add it instead of implementing your own service. Example: you need to zip some files. There is already `ZipService` in `ai_devs_course/services`, but it only extracts files from zip. You can add a zipping method to `ZipService` instead of implementing your own service.
- if some things, like `reportUrl` or `apikey` are unknown, analyze other tasks in the `ai_devs_course` directory and copy necessary values.
- Use environment variables from `.env` file.

You can freely use all installed npm packages. Installing new ones is also permitted, but you should always check if one of the existing packages can be used instead.
Try to keep the code clean and organized. Avoid long files and functions. If a file is getting too long, split it into smaller ones.

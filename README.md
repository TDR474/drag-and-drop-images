# Drag and Drop Images


Easily upload, manage, and insert images into your Jupyter Notebooks with intuitive drag-and-drop functionality. Streamline your workflow by handling image uploads directly within VS Code, ensuring organized and unique image storage.

## Features

- **Seamless Image Upload:** Drag and drop images directly into your Jupyter Notebook cells.
- **Automatic Filename Management:** Prevents overwriting by appending incremental suffixes to duplicate filenames (e.g., `image.png`, `image_1.png`, `image_2.png`, etc.).
- **Image Resizing:** Adjust image dimensions with auto-resize or custom width and height options.
- **Styling Options:** Center images and apply rounded corners to enhance the visual presentation.
- **Integrated Status Bar Controls:** Convenient buttons in the notebook cell's status bar for uploading and resizing images.
- **Real-time Preview:** Preview images before inserting them into your notebook.

> **Tip:** Combine image resizing and styling options to create polished and visually appealing notebooks effortlessly.

## Requirements

- **Visual Studio Code:** Version 1.60.0 or higher.
- **Node.js:** Version 16 or higher (required for development and publishing).
- **Jupyter Extension:** Ensure you have the [Jupyter extension](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) installed for notebook support.

## Extension Settings

This extension does not introduce any additional settings. All configurations are handled within the image upload and resizing process.

## Known Issues

- **Large Image Files:** Uploading extremely large image files may cause performance issues. It's recommended to optimize images before uploading.
- **Unsupported Formats:** Only JPG and PNG formats are supported. Other image formats may not work as expected.
- **File Path Length:** Very long file paths can lead to insertion issues. Keep image paths concise to ensure smooth operations.

If you encounter any other issues, please [open an issue](https://github.com/your-publisher-name/drag-and-drop-images/issues) on GitHub.

## Release Notes

### 1.0.0

- Initial release of **Drag and Drop Images**.
- Features image uploading via drag-and-drop and status bar controls.
- Automatic filename management to prevent duplicates.
- Image resizing with auto and custom dimensions.
- Styling options for centering and rounding image corners.

---

## Following Extension Guidelines

Ensure that you've read through the [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines) and follow the best practices for creating your extension.

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

- **Split the editor:** `Cmd+\` on macOS or `Ctrl+\` on Windows and Linux.
- **Toggle preview:** `Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux.
- **Trigger IntelliSense:** Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For More Information

- [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
- [Markdown Syntax Reference](https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet)

---

**Enjoy enhancing your Jupyter Notebooks with effortless image management!**

---
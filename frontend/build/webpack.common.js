const path = require("path");
const WebpackBar = require("webpackbar");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const devMode = process.env.NODE_ENV !== "production";

const clientDirectory =
  (...paths) => path.join(__dirname, "..", "client", ...paths);

module.exports = {
  "entry": {
    "about": clientDirectory("about", "about.js"),
    "analyze": clientDirectory("analyze", "analyze.ts"),
    "help": clientDirectory("help", "help.js"),
    "index": clientDirectory("index", "index.js"),
    "privacy": clientDirectory("privacy", "privacy.js"),
    "terms": clientDirectory("terms", "terms.js"),
    "viewer": clientDirectory("viewer", "viewer.ts"),
    "visualize": clientDirectory("visualize", "visualize.ts"),
  },
  "output": {
    "path": path.join(__dirname, "..", "dist"),
    "publicPath": "./",
  },
  "resolve": {
    "extensions": [".js", ".jsx", ".ts", ".tsx"],
    "fullySpecified": false,
  },
  "module": {
    "rules": [
      {
        "test": /\.m?js$/,
        "resolve": {
          "fullySpecified": false,
        },
      },
      {
        "test": /\.[jt]sx?$/,
        "loader": "esbuild-loader",
        "options": {
          "loader": "tsx",
          "target": "es2019"
        }
      },
      {
        "test": /\.html$/,
        "loader": "underscore-template-loader",
        "options": {
          "attributes": [], // Disable processing of images.
          "macros": {
            "googleAnalytics": generateGoogleAnalytics,
          },
        },
      },
      {
        "test": /\.s?css$/i,
        "use": [
          devMode ? "style-loader" : MiniCssExtractPlugin.loader,
          {
            "loader": "css-loader",
            "options": {
              "url": false,
            },
          },
          {
            // Run postcss actions
            "loader": "postcss-loader",
            "options": {
              // `postcssOptions` is needed for postcss 8.x;
              // if you use postcss 7.x skip the key
              "postcssOptions": {
                // postcss plugins, can be exported to postcss.config.js
                "plugins": () => [require("autoprefixer")],
              }
            }
          }, {
            // compiles Sass to CSS
            "loader": "sass-loader",
          }]
      },
    ],
  },
  "plugins": [
    new HtmlWebpackPlugin({
      "filename": "about.html",
      "template": clientDirectory("about", "about.html"),
      "chunks": ["about"],
    }),
    new HtmlWebpackPlugin({
      "filename": "analyze.html",
      "template": clientDirectory("analyze", "analyze.html"),
      "chunks": ["analyze"],
    }),
    new HtmlWebpackPlugin({
      "filename": "help.html",
      "template": clientDirectory("help", "help.html"),
      "chunks": ["help"],
    }),
    new HtmlWebpackPlugin({
      "filename": "index.html",
      "template": clientDirectory("index", "index.html"),
      "chunks": ["index"],
    }),
    new HtmlWebpackPlugin({
      "filename": "privacy.html",
      "template": clientDirectory("privacy", "privacy.html"),
      "chunks": ["privacy"],
    }),
    new HtmlWebpackPlugin({
      "filename": "terms.html",
      "template": clientDirectory("terms", "terms.html"),
      "chunks": ["terms"],
    }),
    new HtmlWebpackPlugin({
      "filename": "viewer.html",
      "template": clientDirectory("viewer", "viewer.html"),
      "chunks": ["viewer"],
    }),
    new HtmlWebpackPlugin({
      "filename": "visualize.html",
      "template": clientDirectory("visualize", "visualize.html"),
      "chunks": ["visualize"],
    }),
    new WebpackBar(),
  ]
};

function generateGoogleAnalytics() {
  const ga = process.env.GOOGLE_ANALYTICS;
  if (devMode || ga === undefined || ga === "") {
    return "''";
  }

  // we return only the GA env variable, the rest is handled in the template file
  return `'${ga}'`;
}

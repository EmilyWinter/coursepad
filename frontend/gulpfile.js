const gulp = require('gulp');
const gulpLoadPlugins = require('gulp-load-plugins');

const webpack = require('webpack');
const webpackStream = require('webpack-stream');
const del = require('del');
const autoprefixer = require('autoprefixer-core');

const $ = gulpLoadPlugins();

var KarmaServer = require('karma').Server;

var LEVEL = +process.env.LEVEL;
if (!LEVEL) LEVEL = 1;

const DEV = LEVEL == 1;

function target() {
    if (DEV) {
        return './_build/dev/';
    } else {
        return './_build/prod/';
    }
}

function genWebpackConfig(bleedingEdge) {
    var babel_query = {
        presets: ['es2015', 'stage-3', 'react'],
        plugins: ['transform-runtime']
    };

    if (bleedingEdge) {
        // Target chrome
        babel_query = {
            presets: ['react'],
            plugins: ['transform-es2015-modules-commonjs', 'transform-async-to-generator']
        }
    };
    var conf = {
        output: {
            filename: "main.js",
            publicPath: "/js/"
        },
        module: {
            loaders: [
                {test: /\.tsx?$/, loaders: ['babel?' + JSON.stringify(babel_query), 'ts-loader']},
                {test: /\.js$/, exclude: /node_modules/, loader: "babel", query: babel_query},
            ]
        },
        ts: {
            configFileName: 'tsconfig.webpack.json'
        },
        resolve: {
            extensions: ['', '.ts', '.tsx', '.js']
        },
        plugins: [
            new webpack.DefinePlugin({
                LEVEL: JSON.stringify(LEVEL)
            })
        ]
    };
    return conf;
}

function prod(t) {
    if (DEV) {
        return $.util.noop();
    }
    return t;
}

function dev(t) {
    if (DEV) {
        return t;
    }
    return $.util.noop();
}

gulp.task('js', function() {
    var filter = $.filter(['main.js']);
    return gulp.src('js_src/app.tsx')
        .pipe(webpackStream(genWebpackConfig(DEV)))
        .on('error', $.util.log)
        .pipe((LEVEL <= 7) ? $.util.noop() : $.uglify({
                mangle: {
                    except: ['GeneratorFunction']
                },
                compress: {
                    drop_console: true
                }
             }))
        .pipe(prod(filter))
            .pipe(prod($.rev()))
        .pipe(prod(filter.restore()))

        .pipe(gulp.dest(target() + 'js/'))
        .pipe(prod($.rev.manifest()))
        .pipe(prod(gulp.dest( '/tmp/rev/js' )));
});

gulp.task('css', function() {
    const sassConf = {
        style: DEV ? 'nested' : 'compressed',
        sourcemap: DEV ? true : false
    };

    return gulp.src('sass_src/**/*.scss')
        .pipe($.plumber())
        .pipe($.sass(sassConf).on('error', $.sass.logError))
        .pipe($.postcss([autoprefixer({})]))
        .pipe(prod($.rev()))
        .pipe(gulp.dest(target() + 'css/'))
        .pipe(prod($.rev.manifest()))
        .pipe(prod(gulp.dest( '/tmp/rev/css' )));
});

gulp.task('static', function() {
    var filter = $.filter(['index.html'], {restore: true});
    return gulp.src('static/**')
               .pipe($.plumber())
               .pipe(dev(filter))
               .pipe(dev($.replace('react.min.js', 'react.js')))
               .pipe(dev($.replace('react-dom.min.js', 'react-dom.js')))
               .pipe(dev(filter.restore()))
               .pipe(gulp.dest(target()));
});

gulp.task('default', ['js', 'css', 'static'], () => {
    gulp.watch('js_src/**/*', ['js']);
    gulp.watch('sass_src/**/*.scss', ['css']);
    gulp.watch('static/**', ['static']);
});

gulp.task('clean', function() {
    del(['_build/prod/**']);
});

gulp.task('lint', function() {
    return gulp.src("js_src/**/*.ts")
               .pipe($.tslint())
               .pipe($.tslint.report("verbose"))
});

gulp.task('rev-index', ['js', 'css', 'static'], function() {
    return gulp.src(['/tmp/rev/**/*.json', target() + 'index.html'])
        .pipe($.revCollector({
            replaceReved: true
        }))
        .pipe(gulp.dest(target()))
});

gulp.task('rev-static', ['rev-index'], function() {
    return gulp.src(['/tmp/rev/**/*.json', target() + 'static/*.html'])
        .pipe($.revCollector({
            replaceReved: true
        }))
        .pipe(gulp.dest(target() + 'static/'))
});

gulp.task('build', ['rev-static']);

gulp.task('test', function(done) {
    const webpackConfig = genWebpackConfig(false);
    delete webpackConfig['output'];

    new KarmaServer({
        files: ['js_src/**/tests/*.ts'],
        frameworks: ['mocha'],
        preprocessors: {'js_src/**/tests/*.ts': ['webpack']},
        reporters: ['progress'],
        port: 9876,
        colors: true,
        autoWatch: false,
        browsers: ['PhantomJS'],

        webpack: webpackConfig,
        webpackMiddleware: {
            noInfo: true
        },
        plugins: [
            'karma-webpack',
            'karma-mocha',
            'karma-phantomjs-launcher'
        ],
        singleRun: true
    }, done).start();
});
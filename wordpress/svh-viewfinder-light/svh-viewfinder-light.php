<?php
/**
 * Plugin Name:  Špetla Film – Viewfinder Light
 * Description:  Webová aplikace Viewfinder Light (simulátor nasvícení) pro zákazníky, kteří koupili vybrané produkty. Objeví se v „Můj účet“ a otevírá se na celou obrazovku. Build aplikace se nahrává v administraci jako ZIP, soubory se servírují přes PHP až po ověření nákupu (wc_customer_bought_product), rozpracovaná scéna se ukládá do účtu.
 * Version:      1.0.0
 * Author:       Špetla Film
 * Requires Plugins: woocommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SVHVL_ENDPOINT', 'viewfinder-light' );   // záložka v Můj účet
define( 'SVHVL_QUERY', 'svhvl_app' );             // ?svhvl_app=<soubor> – servírování buildu
define( 'SVHVL_OPT_PRODUCTS', 'svhvl_products' ); // pole ID produktů, které aplikaci odemykají
define( 'SVHVL_OPT_VERSION', 'svhvl_version' );   // aktivní verze buildu
define( 'SVHVL_OPT_INTRO', 'svhvl_intro' );       // text v kartě v Můj účet
define( 'SVHVL_META_SCENE', '_svhvl_scene' );     // rozpracovaná scéna uživatele
define( 'SVHVL_DIR', plugin_dir_path( __FILE__ ) );

/* =============================================
   Umístění buildu + přístup
   ============================================= */

/** Kořen buildů v uploads: wp-content/uploads/svh-viewfinder-light/<verze>/ */
function svhvl_root() {
	$up = wp_upload_dir();
	return trailingslashit( $up['basedir'] ) . 'svh-viewfinder-light';
}

/** Adresář aktivní verze buildu (prázdný řetězec, když není nahrán). */
function svhvl_build_dir() {
	$v = get_option( SVHVL_OPT_VERSION, '' );
	if ( ! $v ) {
		return '';
	}
	$dir = svhvl_root() . '/' . $v;
	return is_dir( $dir ) ? $dir : '';
}

/** ID produktů, které aplikaci odemykají. */
function svhvl_products() {
	$ids = (array) get_option( SVHVL_OPT_PRODUCTS, array() );
	$out = array();
	foreach ( $ids as $id ) {
		$id = absint( $id );
		if ( $id ) {
			$out[] = $id;
		}
	}
	return array_values( array_unique( $out ) );
}

/** Má uživatel aplikaci zakoupenou (dokončená objednávka kteréhokoli z produktů)? */
function svhvl_user_has_access( $user_id = 0 ) {
	$user_id = $user_id ? $user_id : get_current_user_id();
	if ( ! $user_id ) {
		return false;
	}
	if ( user_can( $user_id, 'manage_woocommerce' ) ) {
		return true;
	}
	if ( ! function_exists( 'wc_customer_bought_product' ) ) {
		return false;
	}
	$user = get_userdata( $user_id );
	if ( ! $user ) {
		return false;
	}
	foreach ( svhvl_products() as $pid ) {
		if ( wc_customer_bought_product( $user->user_email, $user_id, $pid ) ) {
			return true;
		}
	}
	return false;
}

/** Odkaz na první nastavený produkt (pro tlačítko koupě). */
function svhvl_buy_url() {
	foreach ( svhvl_products() as $pid ) {
		$url = get_permalink( $pid );
		if ( $url ) {
			return $url;
		}
	}
	return '';
}

/** Adresa, na které se aplikace otevírá (celá stránka bez šablony webu). */
function svhvl_app_url() {
	return add_query_arg( SVHVL_QUERY, 'index.html', home_url( '/' ) );
}

/* =============================================
   Ochrana adresáře (Apache) + index.php (všude)
   ============================================= */
function svhvl_protect_dir() {
	$root = svhvl_root();
	if ( ! wp_mkdir_p( $root ) ) {
		return;
	}
	$ht = $root . '/.htaccess';
	if ( ! file_exists( $ht ) ) {
		file_put_contents( $ht, "Require all denied\n<IfModule !mod_authz_core.c>\nOrder deny,allow\nDeny from all\n</IfModule>\n" );
	}
	$idx = $root . '/index.php';
	if ( ! file_exists( $idx ) ) {
		file_put_contents( $idx, "<?php // Silence is golden.\n" );
	}
}
add_action( 'admin_init', 'svhvl_protect_dir' );

add_action( 'init', function () {
	add_rewrite_endpoint( SVHVL_ENDPOINT, EP_ROOT | EP_PAGES );
} );
register_activation_hook( __FILE__, function () {
	svhvl_protect_dir();
	add_rewrite_endpoint( SVHVL_ENDPOINT, EP_ROOT | EP_PAGES );
	flush_rewrite_rules();
} );
register_deactivation_hook( __FILE__, 'flush_rewrite_rules' );

/* HPOS kompatibilita */
add_action( 'before_woocommerce_init', function () {
	if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
	}
} );

/* =============================================
   Nahrání buildu (ZIP) z administrace
   ============================================= */
function svhvl_handle_upload() {
	if ( empty( $_FILES['svhvl_zip']['tmp_name'] ) ) {
		return new WP_Error( 'svhvl_nofile', 'Nevybrali jste soubor.' );
	}
	if ( ! class_exists( 'ZipArchive' ) ) {
		return new WP_Error( 'svhvl_nozip', 'Na serveru chybí rozšíření ZipArchive.' );
	}
	$ver = sanitize_file_name( wp_unslash( $_POST['svhvl_new_version'] ?? '' ) );
	if ( ! $ver ) {
		$ver = gmdate( 'Y-m-d-Hi' );
	}
	$dest = svhvl_root() . '/' . $ver;
	if ( is_dir( $dest ) ) {
		return new WP_Error( 'svhvl_exists', 'Verze „' . esc_html( $ver ) . '“ už existuje. Zvolte jiný název.' );
	}

	$zip = new ZipArchive();
	if ( true !== $zip->open( $_FILES['svhvl_zip']['tmp_name'] ) ) {
		return new WP_Error( 'svhvl_badzip', 'Soubor se nepodařilo otevřít jako ZIP.' );
	}
	$allowed = array( 'html', 'js', 'css', 'json', 'jpg', 'jpeg', 'png', 'webp', 'svg', 'woff', 'woff2', 'md', 'txt' );
	for ( $i = 0; $i < $zip->numFiles; $i++ ) {
		$name = $zip->getNameIndex( $i );
		if ( substr( $name, -1 ) === '/' ) {
			continue;
		}
		if ( strpos( $name, '..' ) !== false || strpos( $name, ':' ) !== false || substr( $name, 0, 1 ) === '/' ) {
			$zip->close();
			return new WP_Error( 'svhvl_path', 'ZIP obsahuje nebezpečnou cestu: ' . esc_html( $name ) );
		}
		$ext = strtolower( pathinfo( $name, PATHINFO_EXTENSION ) );
		if ( ! in_array( $ext, $allowed, true ) ) {
			$zip->close();
			return new WP_Error( 'svhvl_ext', 'ZIP obsahuje nepovolený typ souboru: ' . esc_html( $name ) );
		}
	}
	if ( ! wp_mkdir_p( $dest ) ) {
		$zip->close();
		return new WP_Error( 'svhvl_mkdir', 'Nepodařilo se vytvořit složku verze.' );
	}
	$zip->extractTo( $dest );
	$zip->close();

	// Build může být zabalený i s nadřazenou složkou – obsah povytáhneme.
	if ( ! file_exists( $dest . '/index.html' ) ) {
		$sub = glob( $dest . '/*', GLOB_ONLYDIR );
		if ( 1 === count( $sub ) && file_exists( $sub[0] . '/index.html' ) ) {
			foreach ( (array) glob( $sub[0] . '/{,.}*', GLOB_BRACE ) as $item ) {
				if ( in_array( basename( $item ), array( '.', '..' ), true ) ) {
					continue;
				}
				rename( $item, $dest . '/' . basename( $item ) );
			}
			@rmdir( $sub[0] );
		}
	}
	if ( ! file_exists( $dest . '/index.html' ) ) {
		return new WP_Error( 'svhvl_incomplete', 'V nahraném ZIPu chybí index.html.' );
	}
	if ( ! file_exists( $dest . '/vendor/three-bundle.js' ) ) {
		return new WP_Error( 'svhvl_incomplete', 'V nahraném ZIPu chybí vendor/three-bundle.js (3D knihovna).' );
	}
	return $ver;
}

/** Smaže složku verze. Aktivní verzi smazat nelze. */
function svhvl_delete_version( $ver ) {
	$ver = sanitize_file_name( $ver );
	if ( ! $ver ) {
		return new WP_Error( 'svhvl_del_empty', 'Nebyla zvolena verze.' );
	}
	if ( $ver === get_option( SVHVL_OPT_VERSION, '' ) ) {
		return new WP_Error( 'svhvl_del_active', 'Nelze smazat verzi, která je právě aktivní. Nejdřív přepněte na jinou.' );
	}
	$root = realpath( svhvl_root() );
	$dir  = realpath( svhvl_root() . '/' . $ver );
	if ( ! $root || ! $dir || strpos( $dir, $root ) !== 0 || ! is_dir( $dir ) ) {
		return new WP_Error( 'svhvl_del_path', 'Složka verze nebyla nalezena.' );
	}
	$it = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $dir, FilesystemIterator::SKIP_DOTS ), RecursiveIteratorIterator::CHILD_FIRST );
	foreach ( $it as $item ) {
		$item->isDir() ? @rmdir( $item->getPathname() ) : @unlink( $item->getPathname() );
	}
	if ( ! @rmdir( $dir ) ) {
		return new WP_Error( 'svhvl_del_fail', 'Složku se nepodařilo odstranit — zkontrolujte oprávnění.' );
	}
	return $ver;
}

/* =============================================
   Administrace
   ============================================= */
add_action( 'admin_menu', function () {
	add_menu_page( 'Viewfinder Light', 'Viewfinder Light', 'manage_options', 'svhvl-settings', 'svhvl_settings_page', 'dashicons-lightbulb', 57 );
} );

function svhvl_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	if ( isset( $_POST['svhvl_delete'] ) && check_admin_referer( 'svhvl_settings' ) ) {
		$res = svhvl_delete_version( wp_unslash( $_POST['svhvl_delete_version'] ?? '' ) );
		echo is_wp_error( $res )
			? '<div class="notice notice-error"><p>' . esc_html( $res->get_error_message() ) . '</p></div>'
			: '<div class="notice notice-success"><p>Verze <code>' . esc_html( $res ) . '</code> byla smazána.</p></div>';
	}
	if ( isset( $_POST['svhvl_upload'] ) && check_admin_referer( 'svhvl_settings' ) ) {
		$res = svhvl_handle_upload();
		if ( is_wp_error( $res ) ) {
			echo '<div class="notice notice-error"><p>' . esc_html( $res->get_error_message() ) . '</p></div>';
		} else {
			update_option( SVHVL_OPT_VERSION, $res );
			echo '<div class="notice notice-success"><p>Verze <code>' . esc_html( $res ) . '</code> byla nahrána a rovnou aktivována.</p></div>';
		}
	}
	if ( isset( $_POST['svhvl_save'] ) && check_admin_referer( 'svhvl_settings' ) ) {
		$raw = wp_unslash( $_POST['svhvl_products'] ?? '' );
		$ids = array();
		foreach ( preg_split( '/[\s,;]+/', (string) $raw ) as $piece ) {
			if ( absint( $piece ) ) {
				$ids[] = absint( $piece );
			}
		}
		update_option( SVHVL_OPT_PRODUCTS, array_values( array_unique( $ids ) ) );
		update_option( SVHVL_OPT_VERSION, sanitize_file_name( wp_unslash( $_POST['svhvl_version'] ?? '' ) ) );
		update_option( SVHVL_OPT_INTRO, sanitize_textarea_field( wp_unslash( $_POST['svhvl_intro'] ?? '' ) ) );
		echo '<div class="notice notice-success"><p>Uloženo.</p></div>';
	}

	svhvl_protect_dir();
	$root     = svhvl_root();
	$versions = array();
	foreach ( (array) glob( $root . '/*', GLOB_ONLYDIR ) as $d ) {
		$versions[] = basename( $d );
	}
	rsort( $versions );
	$cur   = get_option( SVHVL_OPT_VERSION, '' );
	$ids   = svhvl_products();
	$intro = get_option( SVHVL_OPT_INTRO, '' );
	?>
	<div class="wrap">
		<h1>Viewfinder Light</h1>
		<p>Build aplikace (ZIP s <code>index.html</code>, <code>app.js</code>, <code>sim.js</code>, <code>view3d.js</code>, <code>style.css</code> a složkou <code>vendor/</code>) se ukládá do
			<code><?php echo esc_html( $root ); ?>/&lt;verze&gt;/</code>. Soubory nejsou přístupné přímo – servíruje je PHP po ověření nákupu.</p>

		<form method="post">
			<?php wp_nonce_field( 'svhvl_settings' ); ?>
			<table class="form-table">
				<tr>
					<th scope="row"><label for="svhvl_products">ID produktů ve WooCommerce</label></th>
					<td>
						<input type="text" id="svhvl_products" name="svhvl_products" value="<?php echo esc_attr( implode( ', ', $ids ) ); ?>" class="regular-text" placeholder="např. 123, 456">
						<p class="description">Koupě kteréhokoli z těchto produktů (kurzů) aplikaci odemkne. Více ID oddělte čárkou. ID je v adrese produktu jako <code>post=123</code>.</p>
						<?php if ( $ids && function_exists( 'wc_get_product' ) ) : ?>
							<ul style="margin:6px 0 0;color:#555">
								<?php foreach ( $ids as $pid ) : $p = wc_get_product( $pid ); ?>
									<li>#<?php echo (int) $pid; ?> – <?php echo $p ? esc_html( $p->get_name() ) : '<span style="color:#c00">produkt nenalezen</span>'; ?></li>
								<?php endforeach; ?>
							</ul>
						<?php endif; ?>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="svhvl_version">Aktivní verze buildu</label></th>
					<td>
						<select id="svhvl_version" name="svhvl_version">
							<option value="">— nevybráno —</option>
							<?php foreach ( $versions as $v ) : ?>
								<option value="<?php echo esc_attr( $v ); ?>" <?php selected( $v, $cur ); ?>><?php echo esc_html( $v ); ?><?php echo file_exists( $root . '/' . $v . '/index.html' ) ? '' : ' (chybí index.html)'; ?></option>
							<?php endforeach; ?>
						</select>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="svhvl_intro">Text v „Můj účet“</label></th>
					<td>
						<textarea id="svhvl_intro" name="svhvl_intro" rows="3" class="large-text" placeholder="Např.: Plánujte svícení scény v půdorysu a hned vidíte, co uvidí kamera."><?php echo esc_textarea( $intro ); ?></textarea>
					</td>
				</tr>
			</table>
			<p><button type="submit" name="svhvl_save" class="button button-primary">Uložit</button>
				<?php if ( $cur ) : ?>
					<a class="button" href="<?php echo esc_url( svhvl_app_url() ); ?>" target="_blank" rel="noopener">Otevřít aplikaci (jako správce)</a>
				<?php endif; ?>
			</p>
		</form>

		<hr>
		<h2>Nahrát novou verzi buildu</h2>
		<form method="post" enctype="multipart/form-data">
			<?php wp_nonce_field( 'svhvl_settings' ); ?>
			<table class="form-table">
				<tr>
					<th scope="row"><label for="svhvl_zip">ZIP s buildem</label></th>
					<td><input type="file" id="svhvl_zip" name="svhvl_zip" accept=".zip" required></td>
				</tr>
				<tr>
					<th scope="row"><label for="svhvl_new_version">Název verze</label></th>
					<td><input type="text" id="svhvl_new_version" name="svhvl_new_version" class="regular-text" placeholder="např. 2026-09-26 (nepovinné)"></td>
				</tr>
			</table>
			<p><button type="submit" name="svhvl_upload" class="button">Nahrát a aktivovat</button></p>
		</form>

		<?php if ( $versions ) : ?>
			<hr>
			<h2>Nahrané verze</h2>
			<table class="widefat striped" style="max-width:640px">
				<thead><tr><th>Verze</th><th>Stav</th><th></th></tr></thead>
				<tbody>
				<?php foreach ( $versions as $v ) : ?>
					<tr>
						<td><code><?php echo esc_html( $v ); ?></code></td>
						<td><?php echo $v === $cur ? '<strong>aktivní</strong>' : ''; ?></td>
						<td>
							<?php if ( $v !== $cur ) : ?>
								<form method="post" style="display:inline" onsubmit="return confirm('Opravdu smazat verzi <?php echo esc_js( $v ); ?>?');">
									<?php wp_nonce_field( 'svhvl_settings' ); ?>
									<input type="hidden" name="svhvl_delete_version" value="<?php echo esc_attr( $v ); ?>">
									<button type="submit" name="svhvl_delete" class="button-link-delete">Smazat</button>
								</form>
							<?php endif; ?>
						</td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
		<?php endif; ?>

		<hr>
		<p style="color:#666">Zkratka: <code>[viewfinder_light_button]</code> vloží kamkoli tlačítko „Otevřít aplikaci“ (kdo nemá nákup, uvidí odkaz na produkt).</p>
	</div>
	<?php
}

/* =============================================
   Záložka v Můj účet
   ============================================= */
add_filter( 'woocommerce_account_menu_items', function ( $items ) {
	if ( ! svhvl_user_has_access() ) {
		return $items;
	}
	$new = array();
	foreach ( $items as $k => $v ) {
		$new[ $k ] = $v;
		if ( 'orders' === $k ) {
			$new[ SVHVL_ENDPOINT ] = 'Viewfinder Light';
		}
	}
	if ( ! isset( $new[ SVHVL_ENDPOINT ] ) ) {
		$logout = $new['customer-logout'] ?? null;
		unset( $new['customer-logout'] );
		$new[ SVHVL_ENDPOINT ] = 'Viewfinder Light';
		if ( $logout ) {
			$new['customer-logout'] = $logout;
		}
	}
	return $new;
}, 25 );

add_filter( 'the_title', function ( $title, $post_id = 0 ) {
	global $wp_query;
	if ( is_admin() || ! in_the_loop() || ! is_main_query() || ! function_exists( 'is_account_page' ) || ! is_account_page() ) {
		return $title;
	}
	if ( isset( $wp_query->query_vars[ SVHVL_ENDPOINT ] ) && $post_id && (int) $post_id === (int) get_queried_object_id() ) {
		return 'Viewfinder Light';
	}
	return $title;
}, 10, 2 );

add_action( 'woocommerce_account_' . SVHVL_ENDPOINT . '_endpoint', 'svhvl_render' );
function svhvl_render() {
	if ( ! svhvl_user_has_access() ) {
		echo '<p>Aplikaci Viewfinder Light zatím nemáte zakoupenou.</p>';
		if ( $url = svhvl_buy_url() ) {
			echo '<p><a class="button" href="' . esc_url( $url ) . '">Zobrazit v e-shopu</a></p>';
		}
		return;
	}
	if ( ! svhvl_build_dir() ) {
		echo '<p>Aplikace zatím není nahraná. Ozvěte se nám, prosím.</p>';
		return;
	}
	$intro = get_option( SVHVL_OPT_INTRO, '' );
	$saved = get_user_meta( get_current_user_id(), SVHVL_META_SCENE, true );
	$ts    = is_array( $saved ) && ! empty( $saved['ts'] ) ? (int) $saved['ts'] : 0;

	echo '<div style="padding:20px;border:1px solid #e3e3e3;border-radius:12px;background:#111;color:#ece8e0">';
	echo '<div style="font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:#d4b071;font-weight:700">Svět v hledáčku</div>';
	echo '<h3 style="margin:4px 0 8px;color:#fff">Viewfinder Light – simulátor nasvícení</h3>';
	if ( $intro ) {
		echo '<p style="color:#bbb;margin:0 0 14px">' . esc_html( $intro ) . '</p>';
	} else {
		echo '<p style="color:#bbb;margin:0 0 14px">Rozestavte světla, postavu a kameru v půdorysu a hned vidíte, co uvidí kamera. Poměr světel, luxy, slunce oknem, mlhostroj, gobo.</p>';
	}
	echo '<p style="margin:0"><a class="button button-primary" style="background:#d4b071;color:#111;border:0;font-weight:700" href="' . esc_url( svhvl_app_url() ) . '">Otevřít aplikaci na celou obrazovku</a></p>';
	if ( $ts ) {
		echo '<p style="color:#8f8a80;font-size:.82rem;margin:12px 0 0">Rozpracovaná scéna uložená v účtu: ' . esc_html( wp_date( 'j. n. Y H:i', (int) ( $ts / 1000 ) ) ) . '. Aplikace ji při otevření sama načte.</p>';
	}
	echo '<p style="color:#8f8a80;font-size:.82rem;margin:6px 0 0">Doporučujeme počítač s myší a klávesnicí. Aplikace běží přímo v prohlížeči, nic se neinstaluje.</p>';
	echo '</div>';
}

/* Zkratka [viewfinder_light_button] – tlačítko kamkoli na web */
add_shortcode( 'viewfinder_light_button', function ( $atts ) {
	$a = shortcode_atts( array( 'text' => 'Otevřít Viewfinder Light' ), $atts );
	if ( ! is_user_logged_in() ) {
		return '<a class="button" href="' . esc_url( wp_login_url( svhvl_app_url() ) ) . '">' . esc_html( $a['text'] ) . ' (přihlásit)</a>';
	}
	if ( svhvl_user_has_access() ) {
		return '<a class="button" href="' . esc_url( svhvl_app_url() ) . '">' . esc_html( $a['text'] ) . '</a>';
	}
	$url = svhvl_buy_url();
	return $url ? '<a class="button" href="' . esc_url( $url ) . '">Získat přístup k aplikaci</a>' : '';
} );

/* =============================================
   Servírování buildu přes PHP
   ============================================= */
add_action( 'template_redirect', function () {
	if ( isset( $_GET[ SVHVL_QUERY ] ) ) {
		svhvl_serve_file( wp_unslash( $_GET[ SVHVL_QUERY ] ) );
	}
} );

function svhvl_serve_file( $rel ) {
	$rel = ltrim( str_replace( '\\', '/', (string) $rel ), '/' );
	$rel = preg_replace( '#\.\.+/#', '', $rel );
	$ext = strtolower( pathinfo( $rel, PATHINFO_EXTENSION ) );

	if ( ! is_user_logged_in() ) {
		// HTML: poslat na přihlášení a vrátit se zpět; ostatní soubory jen odmítnout.
		if ( 'html' === $ext ) {
			wp_safe_redirect( wp_login_url( svhvl_app_url() ) );
			exit;
		}
		status_header( 403 );
		exit( 'Přístup zamítnut.' );
	}
	if ( ! svhvl_user_has_access() ) {
		if ( 'html' === $ext && function_exists( 'wc_get_account_endpoint_url' ) ) {
			wp_safe_redirect( wc_get_account_endpoint_url( SVHVL_ENDPOINT ) );
			exit;
		}
		status_header( 403 );
		exit( 'Přístup zamítnut.' );
	}
	$dir = svhvl_build_dir();
	if ( ! $dir ) {
		status_header( 404 );
		exit( 'Aplikace není nahraná.' );
	}
	$path = realpath( $dir . '/' . $rel );
	if ( ! $path || strpos( $path, realpath( $dir ) ) !== 0 || ! is_file( $path ) ) {
		status_header( 404 );
		exit;
	}
	$types = array(
		'html' => 'text/html; charset=UTF-8', 'js' => 'application/javascript; charset=UTF-8', 'css' => 'text/css; charset=UTF-8',
		'json' => 'application/json; charset=UTF-8', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
		'webp' => 'image/webp', 'svg' => 'image/svg+xml', 'woff' => 'font/woff', 'woff2' => 'font/woff2',
	);
	if ( ! isset( $types[ $ext ] ) ) {
		status_header( 403 );
		exit;
	}
	header( 'Content-Type: ' . $types[ $ext ] );
	header( 'X-Content-Type-Options: nosniff' );
	header( 'X-Robots-Tag: noindex, nofollow' );

	if ( 'html' === $ext ) {
		nocache_headers();
		$html = svhvl_rewrite_html( file_get_contents( $path ) );
		header( 'Content-Length: ' . strlen( $html ) );
		echo $html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		exit;
	}
	// Skripty a knihovna se mění jen s verzí – prohlížeč je smí držet v cache (soukromě, za přihlášením).
	header( 'Cache-Control: private, max-age=604800' );
	header( 'Content-Length: ' . filesize( $path ) );
	readfile( $path );
	exit;
}

/** Přepíše relativní odkazy na proxy URL a vloží konfiguraci, lištu zpět a vodoznak. */
function svhvl_rewrite_html( $html ) {
	$ver   = (string) get_option( SVHVL_OPT_VERSION, '' );
	$proxy = function ( $file ) use ( $ver ) {
		// verze v adrese: po nahrání nového buildu se cache prohlížeče nepoplete
		return esc_url( add_query_arg( array( SVHVL_QUERY => $file, 'v' => $ver ), home_url( '/' ) ) );
	};
	// src="app.js", href="style.css", src="vendor/three-bundle.js" … (jen relativní cesty bez schématu)
	$html = preg_replace_callback( '#\b(src|href)="(?![a-z]+:|//|\#|data:)([^"]+\.(?:js|css|json|png|jpe?g|webp|svg|woff2?))"#i', function ( $m ) use ( $proxy ) {
		return $m[1] . '="' . $proxy( $m[2] ) . '"';
	}, $html );

	$user = wp_get_current_user();
	$back = function_exists( 'wc_get_account_endpoint_url' ) ? wc_get_account_endpoint_url( SVHVL_ENDPOINT ) : home_url( '/' );
	$cfg  = '<meta name="robots" content="noindex,nofollow">'
		. '<script>window.SVH_VIEWFINDER=' . wp_json_encode( array(
			'back'    => esc_url_raw( $back ),
			'rest'    => esc_url_raw( rest_url( 'svhvl/v1/scene' ) ),
			'nonce'   => wp_create_nonce( 'wp_rest' ),
			'version' => $ver,
			'email'   => $user->user_email,
		) ) . ';</script>';
	$wm = '<div style="position:fixed;right:10px;bottom:6px;z-index:60;font:11px -apple-system,sans-serif;color:rgba(160,160,160,.55);pointer-events:none">'
		. esc_html( $user->user_email ) . '</div>';

	$pos = stripos( $html, '</head>' );
	if ( false !== $pos ) {
		$html = substr_replace( $html, $cfg . '</head>', $pos, 7 );
	}
	$pos = strripos( $html, '</body>' );
	if ( false !== $pos ) {
		$html = substr_replace( $html, $wm . '</body>', $pos, 7 );
	}
	return $html;
}

/* =============================================
   REST: rozpracovaná scéna v účtu (jedna na uživatele)
   ============================================= */
add_action( 'rest_api_init', function () {
	register_rest_route( 'svhvl/v1', '/scene', array(
		array(
			'methods'             => 'GET',
			'permission_callback' => function () { return svhvl_user_has_access(); },
			'callback'            => function () {
				$s = get_user_meta( get_current_user_id(), SVHVL_META_SCENE, true );
				if ( ! is_array( $s ) || empty( $s['scene'] ) ) {
					return rest_ensure_response( new stdClass() );
				}
				return rest_ensure_response( array( 'scene' => (string) $s['scene'], 'ts' => (int) $s['ts'] ) );
			},
		),
		array(
			'methods'             => 'POST',
			'permission_callback' => function () { return svhvl_user_has_access(); },
			'callback'            => function ( $req ) {
				$scene = (string) $req->get_param( 'scene' );
				if ( strlen( $scene ) > 1500000 ) {
					return new WP_Error( 'svhvl_big', 'Scéna je příliš velká.', array( 'status' => 413 ) );
				}
				$data = json_decode( $scene, true );
				if ( ! is_array( $data ) || empty( $data['room'] ) || ! isset( $data['items'] ) ) {
					return new WP_Error( 'svhvl_bad', 'Neplatná scéna.', array( 'status' => 400 ) );
				}
				// ukládáme znovu zakódovaný JSON – nikdy surový vstup
				update_user_meta( get_current_user_id(), SVHVL_META_SCENE, array(
					'scene' => wp_json_encode( $data ),
					'ts'    => absint( $req->get_param( 'ts' ) ) ?: (int) ( microtime( true ) * 1000 ),
				) );
				return rest_ensure_response( array( 'ok' => true ) );
			},
		),
	) );
} );

/* Soukromí: export a výmaz uložené scény */
add_filter( 'wp_privacy_personal_data_exporters', function ( $ex ) {
	$ex['svh-viewfinder-light'] = array(
		'exporter_friendly_name' => 'Viewfinder Light – uložená scéna',
		'callback'               => function ( $email ) {
			$u = get_user_by( 'email', $email );
			$s = $u ? get_user_meta( $u->ID, SVHVL_META_SCENE, true ) : null;
			$data = array();
			if ( is_array( $s ) && ! empty( $s['scene'] ) ) {
				$data[] = array( 'group_id' => 'svhvl', 'group_label' => 'Viewfinder Light', 'item_id' => 'scene', 'data' => array( array( 'name' => 'Scéna (JSON)', 'value' => $s['scene'] ) ) );
			}
			return array( 'data' => $data, 'done' => true );
		},
	);
	return $ex;
} );
add_filter( 'wp_privacy_personal_data_erasers', function ( $er ) {
	$er['svh-viewfinder-light'] = array(
		'eraser_friendly_name' => 'Viewfinder Light – uložená scéna',
		'callback'             => function ( $email ) {
			$u = get_user_by( 'email', $email );
			$removed = false;
			if ( $u && get_user_meta( $u->ID, SVHVL_META_SCENE, true ) ) {
				delete_user_meta( $u->ID, SVHVL_META_SCENE );
				$removed = true;
			}
			return array( 'items_removed' => $removed, 'items_retained' => false, 'messages' => array(), 'done' => true );
		},
	);
	return $er;
} );

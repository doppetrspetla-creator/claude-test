<?php
/**
 * Plugin Name:  Špetla Film – Viewfinder Light
 * Description:  Webová aplikace Viewfinder Light (simulátor nasvícení) pro zákazníky, kteří koupili vybrané produkty. Objeví se v „Můj účet“ a otevírá se na celou obrazovku. Build aplikace se nahrává v administraci jako ZIP, soubory se servírují přes PHP až po ověření nákupu (dokončená objednávka), rozpracovaná scéna se ukládá do účtu. Do e-mailů k objednávce, na děkovací stránku a do detailu objednávky vkládá blok „Vstup do aplikace“. Aplikaci jde nainstalovat do počítače / tabletu (PWA) a používat i offline s pravidelným ověřením nákupu.
 * Version:      1.2.0
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
define( 'SVHVL_PATH', 'viewfinder-app' );          // adresa aplikace /viewfinder-app/ (instalovatelná aplikace potřebuje skutečnou cestu)
define( 'SVHVL_OPT_OFFLINE', 'svhvl_offline_days' ); // kolik dní smí nainstalovaná aplikace běžet bez ověření
define( 'SVHVL_RW', '2' );                         // verze přepisovacích pravidel – při změně se jednou obnoví

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
	if ( ! function_exists( 'wc_get_orders' ) ) {
		return false;
	}
	$user = get_userdata( $user_id );
	if ( ! $user || ! svhvl_products() ) {
		return false;
	}
	static $cache = array();
	if ( isset( $cache[ $user_id ] ) ) {
		return $cache[ $user_id ];
	}
	// Přístup dává jen DOKONČENÁ objednávka (ne „zpracovává se“, „čeká na platbu“ apod.):
	// objednávky účtu + objednávky bez účtu se stejným e-mailem.
	$orders = array_merge(
		wc_get_orders( array( 'customer_id' => $user_id, 'status' => array( 'wc-completed' ), 'limit' => -1 ) ),
		wc_get_orders( array( 'billing_email' => $user->user_email, 'status' => array( 'wc-completed' ), 'limit' => -1 ) )
	);
	$cache[ $user_id ] = false;
	foreach ( $orders as $order ) {
		if ( svhvl_order_has_app( $order ) ) {
			$cache[ $user_id ] = true;
			break;
		}
	}
	return $cache[ $user_id ];
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

/** Běží web s „hezkými“ trvalými odkazy? Jen pak má aplikace vlastní adresu /viewfinder-app/ a jde nainstalovat. */
function svhvl_pretty() {
	return (bool) get_option( 'permalink_structure' );
}

/** Počet dní, po které smí nainstalovaná aplikace běžet offline bez ověření nákupu. */
function svhvl_offline_days() {
	$d = absint( get_option( SVHVL_OPT_OFFLINE, 30 ) );
	return $d ? min( 365, $d ) : 30;
}

/** Adresa, na které se aplikace otevírá (celá stránka bez šablony webu). */
function svhvl_app_url() {
	if ( svhvl_pretty() ) {
		return home_url( '/' . SVHVL_PATH . '/' );
	}
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

function svhvl_rewrites() {
	add_rewrite_endpoint( SVHVL_ENDPOINT, EP_ROOT | EP_PAGES );
	// /viewfinder-app/ → index.html, /viewfinder-app/<soubor> → soubor buildu
	add_rewrite_rule( '^' . SVHVL_PATH . '/?$', 'index.php?' . SVHVL_QUERY . '=index.html', 'top' );
	add_rewrite_rule( '^' . SVHVL_PATH . '/(.+)$', 'index.php?' . SVHVL_QUERY . '=$matches[1]', 'top' );
}
add_action( 'init', function () {
	svhvl_rewrites();
	if ( get_option( 'svhvl_rw' ) !== SVHVL_RW ) { // po aktualizaci pluginu jednou obnovit pravidla
		flush_rewrite_rules( false );
		update_option( 'svhvl_rw', SVHVL_RW );
	}
} );
add_filter( 'query_vars', function ( $vars ) {
	$vars[] = SVHVL_QUERY;
	return $vars;
} );
register_activation_hook( __FILE__, function () {
	svhvl_protect_dir();
	svhvl_rewrites();
	flush_rewrite_rules();
	update_option( 'svhvl_rw', SVHVL_RW );
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
	$allowed = array( 'html', 'js', 'css', 'json', 'jpg', 'jpeg', 'png', 'webp', 'svg', 'woff', 'woff2', 'md', 'txt', 'glb', 'gltf', 'bin' );
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
		update_option( SVHVL_OPT_OFFLINE, max( 1, min( 365, absint( $_POST['svhvl_offline'] ?? 30 ) ) ) );
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
						<p class="description">Dokončená objednávka kteréhokoli z těchto produktů (kurzů) aplikaci odemkne – objednávka ve stavu „Zpracovává se“ nebo „Čeká na platbu“ ještě ne. Více ID oddělte čárkou. ID je v adrese produktu jako <code>post=123</code>.</p>
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
					<th scope="row"><label for="svhvl_offline">Offline bez ověření</label></th>
					<td>
						<input type="number" id="svhvl_offline" name="svhvl_offline" min="1" max="365" value="<?php echo (int) svhvl_offline_days(); ?>" class="small-text"> dní
						<p class="description">Nainstalovaná aplikace běží i bez internetu. Po této době bez připojení si vyžádá ověření nákupu (přihlášení do e-shopu). Při každém spuštění online se ověřuje vždy.</p>
						<?php if ( ! svhvl_pretty() ) : ?>
							<p style="color:#c00">Web nemá zapnuté „hezké“ trvalé odkazy (Nastavení → Trvalé odkazy), proto aplikaci nejde nainstalovat. Běží jen v prohlížeči.</p>
						<?php endif; ?>
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
		<p style="color:#666">Jakmile je objednávka <strong>dokončená</strong>, vloží se do e-mailu zákazníkovi (Dokončená objednávka), na děkovací stránku a do detailu objednávky v Můj účet blok <strong>VSTUP DO APLIKACE</strong> s tlačítkem a informací, že se zákazník může kdykoli přihlásit v Můj účet → Viewfinder Light. U ostatních stavů objednávky se odkaz neposílá a aplikace se neodemyká. Týká se jen objednávek s některým z produktů výše.</p>
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
	if ( svhvl_pretty() ) {
		echo '<p style="color:#bbb;font-size:.9rem;margin:14px 0 0"><strong style="color:#fff">Aplikaci si můžete nainstalovat do počítače nebo iPadu.</strong> Otevřete ji a klikněte vlevo nahoře na „⤓ Nainstalovat“. Pak bude mít vlastní ikonu a okno a poběží i bez internetu – nákup si jen jednou za ' . (int) svhvl_offline_days() . ' dní ověří, až budete online.</p>';
	}
	echo '<p style="color:#8f8a80;font-size:.82rem;margin:6px 0 0">Nejlépe funguje na počítači nebo iPadu, na telefonu má zjednodušené ovládání. Nic se nestahuje ručně, aktualizace přicházejí samy.</p>';
	echo '</div>';
}

/* =============================================
   VSTUP DO APLIKACE v objednávce
   (e-maily zákazníkovi, děkovací stránka, detail objednávky v Můj účet)
   Aplikace je virtuální produkt – bez tohoto bloku by zákazníkovi přišla jen objednávka a faktura.
   ============================================= */

/** Obsahuje objednávka některý z produktů, které aplikaci odemykají? (i varianty produktu) */
function svhvl_order_has_app( $order ) {
	if ( ! $order || ! is_a( $order, 'WC_Order' ) ) {
		return false;
	}
	$ids = svhvl_products();
	if ( ! $ids ) {
		return false;
	}
	foreach ( $order->get_items() as $item ) {
		if ( ! is_a( $item, 'WC_Order_Item_Product' ) ) {
			continue;
		}
		if ( in_array( (int) $item->get_product_id(), $ids, true ) || in_array( (int) $item->get_variation_id(), $ids, true ) ) {
			return true;
		}
	}
	return false;
}

/** Adresa záložky Viewfinder Light v Můj účet (nepřihlášenému WooCommerce nejdřív ukáže přihlášení). */
function svhvl_account_url() {
	return function_exists( 'wc_get_account_endpoint_url' ) ? wc_get_account_endpoint_url( SVHVL_ENDPOINT ) : wp_login_url( svhvl_app_url() );
}

/** Blok „Vstup do aplikace“ patří jen k DOKONČENÉ objednávce s produktem aplikace. */
function svhvl_order_grants_access( $order ) {
	return svhvl_order_has_app( $order ) && $order->has_status( 'completed' );
}

/** Texty bloku (účet / nákup bez účtu). */
function svhvl_order_access_texts( $order ) {
	$guest       = ! $order->get_user_id();
	$email       = $order->get_billing_email();
	$t           = array( 'lead' => 'Aplikace Viewfinder Light je pro vás připravená. Otevřete ji tlačítkem níže.' );
	$t['always'] ='Do aplikace se můžete kdykoli vrátit: přihlaste se na webu a v sekci „Můj účet“ klikněte na záložku „Viewfinder Light“. Rozpracovaná scéna se ukládá do vašeho účtu.';
	if ( $guest && $email ) {
		$t['always'] .= ' Objednávku jste dokončili bez účtu – přihlaste se, prosím, nebo si účet založte se stejným e-mailem (' . $email . '), přístup se k němu přiřadí automaticky.';
	}
	return $t;
}

/** Blok v e-mailu zákazníkovi (HTML i prostý text) – jen u dokončené objednávky, ne v e-mailech pro správce. */
add_action( 'woocommerce_email_after_order_table', function ( $order, $sent_to_admin, $plain_text, $email = null ) {
	if ( $sent_to_admin || ! svhvl_order_grants_access( $order ) ) {
		return;
	}
	$t   = svhvl_order_access_texts( $order );
	$url = svhvl_account_url();
	if ( $plain_text ) {
		echo "\n==============================\n";
		echo "VSTUP DO APLIKACE – Viewfinder Light\n";
		echo "==============================\n";
		echo wp_strip_all_tags( $t['lead'] ) . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- prostý text e-mailu
		echo esc_url_raw( $url ) . "\n\n";
		echo wp_strip_all_tags( $t['always'] ) . "\n\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		return;
	}
	?>
	<table cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 32px;border-collapse:separate;background:#111;border-radius:10px">
		<tr><td style="padding:22px 24px;color:#ece8e0;font-family:Helvetica,Arial,sans-serif">
			<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#d4b071;font-weight:bold;margin:0 0 6px">Svět v hledáčku · Viewfinder Light</div>
			<div style="font-size:20px;font-weight:bold;color:#ffffff;margin:0 0 10px">VSTUP DO APLIKACE</div>
			<p style="margin:0 0 16px;color:#ddd6c8;font-size:14px;line-height:1.5"><?php echo esc_html( $t['lead'] ); ?></p>
			<table cellspacing="0" cellpadding="0" border="0"><tr><td style="border-radius:8px;background:#d4b071">
				<a href="<?php echo esc_url( $url ); ?>" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:bold;color:#111111;text-decoration:none;border-radius:8px">Vstoupit do aplikace</a>
			</td></tr></table>
			<p style="margin:16px 0 0;color:#a8a194;font-size:13px;line-height:1.5"><?php echo esc_html( $t['always'] ); ?></p>
			<p style="margin:8px 0 0;color:#8f8a80;font-size:12px;line-height:1.5">Odkaz: <a href="<?php echo esc_url( $url ); ?>" style="color:#d4b071"><?php echo esc_html( $url ); ?></a></p>
		</td></tr>
	</table>
	<?php
}, 10, 4 );

/** Blok na děkovací stránce a v detailu objednávky v Můj účet – jen u dokončené objednávky. */
add_action( 'woocommerce_order_details_after_order_table', function ( $order ) {
	if ( ! svhvl_order_grants_access( $order ) ) {
		return;
	}
	$t      = svhvl_order_access_texts( $order );
	$ready  = is_user_logged_in() && svhvl_user_has_access() && svhvl_build_dir();
	$target = $ready ? svhvl_app_url() : svhvl_account_url();
	echo '<section class="svhvl-order-access" style="margin:24px 0;padding:22px 24px;border-radius:12px;background:#111;color:#ece8e0">';
	echo '<div style="font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:#d4b071;font-weight:700">Svět v hledáčku · Viewfinder Light</div>';
	echo '<h2 style="margin:4px 0 10px;color:#fff;font-size:1.35rem">VSTUP DO APLIKACE</h2>';
	echo '<p style="color:#ddd6c8;margin:0 0 14px">' . esc_html( $t['lead'] ) . '</p>';
	echo '<p style="margin:0"><a class="button" style="background:#d4b071;color:#111;border:0;font-weight:700" href="' . esc_url( $target ) . '">' . ( $ready ? 'Otevřít aplikaci na celou obrazovku' : 'Vstoupit do aplikace' ) . '</a></p>';
	echo '<p style="color:#a8a194;font-size:.88rem;margin:14px 0 0">' . esc_html( $t['always'] ) . '</p>';
	echo '</section>';
}, 5 );

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
// priorita 0: dřív než redirect_canonical, který by k souborům přidával lomítko
add_action( 'template_redirect', function () {
	$f = get_query_var( SVHVL_QUERY );
	if ( ! $f && isset( $_GET[ SVHVL_QUERY ] ) ) {
		$f = wp_unslash( $_GET[ SVHVL_QUERY ] );
		// starý odkaz /?svhvl_app=index.html → vlastní adresa aplikace (kvůli instalaci)
		if ( 'index.html' === $f && svhvl_pretty() ) {
			wp_safe_redirect( svhvl_app_url() );
			exit;
		}
	}
	if ( $f ) {
		// /viewfinder-app bez lomítka → s lomítkem (jinak by relativní cesty k souborům vedly mimo aplikaci)
		if ( 'index.html' === $f && svhvl_pretty() && ! isset( $_GET[ SVHVL_QUERY ] ) ) {
			$p = (string) wp_parse_url( $_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH );
			if ( '/' !== substr( $p, -1 ) && '/index.html' !== substr( $p, -11 ) ) {
				wp_safe_redirect( svhvl_app_url() );
				exit;
			}
		}
		svhvl_serve_file( (string) $f );
	}
}, 0 );

function svhvl_serve_file( $rel ) {
	$rel = ltrim( str_replace( '\\', '/', (string) $rel ), '/' );
	$rel = preg_replace( '#\.\.+/#', '', $rel );
	$ext = strtolower( pathinfo( $rel, PATHINFO_EXTENSION ) );

	// manifest a ikony si prohlížeč stahuje bez přihlašovacích cookies – jsou veřejné (nic citlivého)
	$public = ( 'manifest.json' === $rel || 0 === strpos( $rel, 'icons/' ) );
	if ( $public ) {
		// přeskočit ověření přihlášení a nákupu
	} elseif ( ! is_user_logged_in() ) {
		// HTML: poslat na přihlášení a vrátit se zpět; ostatní soubory jen odmítnout.
		if ( 'html' === $ext ) {
			wp_safe_redirect( wp_login_url( svhvl_app_url() ) );
			exit;
		}
		status_header( 403 );
		exit( 'Přístup zamítnut.' );
	}
	if ( ! $public && ! svhvl_user_has_access() ) {
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
		'glb' => 'model/gltf-binary', 'gltf' => 'model/gltf+json', 'bin' => 'application/octet-stream',
	);
	if ( ! isset( $types[ $ext ] ) ) {
		status_header( 403 );
		exit;
	}
	status_header( 200 ); // WordPress mohl u vlastní adresy /viewfinder-app/… mezitím nastavit 404
	header( 'Content-Type: ' . $types[ $ext ] );
	header( 'X-Content-Type-Options: nosniff' );
	header( 'X-Robots-Tag: noindex, nofollow' );

	if ( 'sw.js' === basename( $rel ) ) {
		// service worker: prohlížeč musí vždy vidět aktuální verzi (nová verze buildu = nová cache)
		nocache_headers();
		header( 'Content-Length: ' . filesize( $path ) );
		readfile( $path );
		exit;
	}
	if ( 'html' === $ext ) {
		nocache_headers();
		header( 'X-SVHVL-Offline-Days: ' . svhvl_offline_days() );
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
	$ver    = (string) get_option( SVHVL_OPT_VERSION, '' );
	$pretty = svhvl_pretty();
	$proxy  = function ( $file ) use ( $ver, $pretty ) {
		// verze v adrese: po nahrání nového buildu se cache prohlížeče nepoplete
		if ( $pretty ) { // /viewfinder-app/<soubor>?v=… – relativní cesta zůstává
			return esc_attr( $file ) . '?v=' . rawurlencode( $ver );
		}
		return esc_url( add_query_arg( array( SVHVL_QUERY => $file, 'v' => $ver ), home_url( '/' ) ) );
	};
	// src="app.js", href="style.css", src="vendor/three-bundle.js" … (jen relativní cesty bez schématu)
	$html = preg_replace_callback( '#\b(src|href)="(?![a-z]+:|//|\#|data:)([^"]+\.(?:js|css|json|png|jpe?g|webp|svg|woff2?|glb|gltf|bin))"#i', function ( $m ) use ( $proxy ) {
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
			// dynamicky načítané soubory (modely postav a auta) – JS nahradí __FILE__ cestou
			'asset'     => $pretty ? home_url( '/' . SVHVL_PATH . '/__FILE__' ) . '?v=' . rawurlencode( $ver ) : esc_url_raw( add_query_arg( array( SVHVL_QUERY => '__FILE__', 'v' => $ver ), home_url( '/' ) ) ),
			'assetPath' => $pretty,
			'pwa'       => $pretty, // instalovatelná aplikace + offline režim
			'ajax'      => esc_url_raw( admin_url( 'admin-ajax.php?action=rest-nonce' ) ),
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

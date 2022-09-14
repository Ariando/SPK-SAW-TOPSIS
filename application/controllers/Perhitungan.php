<?php

defined('BASEPATH') or exit('No direct script access allowed');

class Perhitungan extends CI_Controller
{

	public function __construct()
	{
		parent::__construct();
		$this->load->library('pagination');
		$this->load->library('form_validation');
		$this->load->model('Perhitungan_model');
	}

	public function index()
	{
		if ($this->session->userdata('id_user_level') != "1") {
?>
			<script type="text/javascript">
				alert('Anda tidak berhak mengakses halaman ini!');
				window.location = '<?php echo base_url("Login/home"); ?>'
			</script>
<?php
		}

		if (isset($_POST['hitung'])) {
			if ($_POST['metode'] == "topsis") {
				$alternatif = $this->Perhitungan_model->get_alternatif();
				$kriteria = $this->Perhitungan_model->get_kriteria();

				$this->Perhitungan_model->hapus_pangkat();
				foreach ($alternatif as $keys) {
					foreach ($kriteria as $key) {
						$data_pencocokan = $this->Perhitungan_model->data_nilai($keys->id_alternatif, $key->id_kriteria);
						$pangkat = $data_pencocokan['nilai'] * $data_pencocokan['nilai'];
						$nilai_pangkat = [
							'id_kriteria' => $key->id_kriteria,
							'nilai' => $pangkat
						];
						$result = $this->Perhitungan_model->insert_nilai_pangkat($nilai_pangkat);
					}
				}

				$this->Perhitungan_model->hapus_normalisasi_terbobot();
				foreach ($alternatif as $keys) {
					foreach ($kriteria as $key) {
						$data_pencocokan = $this->Perhitungan_model->data_nilai($keys->id_alternatif, $key->id_kriteria);
						$data_pangkat = $this->Perhitungan_model->get_total_pangkat($key->id_kriteria);
						$bobot = $key->bobot;

						$hs = @($bobot * ($data_pencocokan['nilai'] / sqrt($data_pangkat['nilai'])));
						$hsl = round($hs, 4);
						$normalisasi_terbobot = [
							'id_alternatif' => $keys->id_alternatif,
							'id_kriteria' => $key->id_kriteria,
							'nilai' => $hsl
						];
						$result = $this->Perhitungan_model->insert_normalisasi_terbobot($normalisasi_terbobot);
					}
				}
			}
		}
		$data = [
			'page' => "Perhitungan",
			'kriteria' => $this->Perhitungan_model->get_kriteria(),
			'alternatif' => $this->Perhitungan_model->get_alternatif(),
			'total_bobot' => $this->Perhitungan_model->get_sum_bobot()
		];


		$this->load->view('Perhitungan/perhitungan', $data);
	}

	public function hasil()
	{
		$data = [
			'page' => "Hasil",
			'hasil_saw' => $this->Perhitungan_model->get_hasil_saw(),
			'hasil_topsis' => $this->Perhitungan_model->get_hasil_topsis(),
			'hasil_wp' => $this->Perhitungan_model->get_hasil_wp()
		];

		$this->load->view('Perhitungan/hasil', $data);
	}
}
